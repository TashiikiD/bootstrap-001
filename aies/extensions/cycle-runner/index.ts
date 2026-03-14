import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CycleState } from "../../contracts/cycle-state.ts";
import { restoreEvaluationEntry, type EvaluationEntry } from "../evaluation/state.ts";
import { restoreOpenSpecEntry, type OpenSpecEntry } from "../openspec/state.ts";
import { restorePolicyModeEntry } from "../policy/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  restoreRecoveryEntry,
  restoreVerificationEntry,
  restoreVerificationModeEntry,
  type RecoveryEntry,
  type VerificationEntry,
  type VerificationModeEntry,
} from "../verification/state.ts";
import {
  CYCLE_RUN_ENTRY_TYPE,
  CYCLE_THOUGHT_ENTRY_TYPE,
  restoreCycleRunEntry,
  type CycleRunEntry,
  type CycleRunStatus,
  type CycleRunTriggerSource,
  type CycleThoughtBlock,
  type CycleThoughtEntry,
} from "./state.ts";

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  completedCycles: number;
  lastPromptText: string | null;
  lastAssistantText: string | null;
  lastCompletedAt: string | null;
};

type AgentEndEvent = {
  messages: AgentMessage[];
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const DEFAULT_TRIGGER_SOURCE: CycleRunTriggerSource = "slash_command";
const OPERATOR_SOURCE = "operator_ui";

function nowIso(): string {
  return new Date().toISOString();
}

function createRunId(): string {
  return `run-${Date.now()}`;
}

function getSessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionFile() ?? "ephemeral";
}

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 180): string {
  const compact = normalize(text);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractText(message: AgentMessage | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function latestAssistantText(messages: AgentMessage[]): string {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  return extractText(assistant);
}

function restoreHeartbeat(ctx: ExtensionContext): HeartbeatEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const heartbeatEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  return heartbeatEntry?.data ?? null;
}

function persistRun(pi: ExtensionAPI, entry: CycleRunEntry): void {
  pi.appendEntry(CYCLE_RUN_ENTRY_TYPE, entry);
}

function persistThoughts(pi: ExtensionAPI, entry: CycleThoughtEntry): void {
  pi.appendEntry(CYCLE_THOUGHT_ENTRY_TYPE, entry);
}

function parseThinkingSummary(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as { summary?: Array<{ type?: string; text?: string }> };
    if (!Array.isArray(parsed.summary)) return [];
    return parsed.summary
      .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractThoughtBlocks(messages: AgentMessage[]): CycleThoughtBlock[] {
  const blocks: CycleThoughtBlock[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;

    for (const item of message.content) {
      if (item.type !== "thinking") continue;
      const summarized = parseThinkingSummary((item as { thinkingSignature?: unknown }).thinkingSignature);
      const fallback = typeof (item as { thinking?: unknown }).thinking === "string"
        ? (item as { thinking?: string }).thinking?.trim() ?? ""
        : "";
      const texts = summarized.length > 0 ? summarized : fallback ? [fallback] : [];

      for (const text of texts) {
        blocks.push({
          index: blocks.length + 1,
          label: `Thought ${blocks.length + 1}`,
          text,
        });
      }
    }
  }

  return blocks;
}

function updateUi(entry: CycleRunEntry | null, ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  const statusText = entry ? `cycle:${entry.status}` : "cycle:idle";
  ctx.ui.setStatus(AIES_STATUS_KEYS.cycleRunner, ctx.ui.theme.fg("accent", statusText));
  ctx.ui.setWidget(AIES_WIDGET_KEYS.cycleRunner, entry
    ? [
        `run=${entry.runId}`,
        `status=${entry.status}`,
        `source=${entry.triggerSource}`,
        `change=${entry.relatedChangeId ?? "none"}`,
        `cycle=${entry.relatedCycleId ?? "pending"}`,
        `prompt=${entry.promptSummary}`,
      ]
    : [
        "Cycle runner active",
        "status=idle",
        "source=none",
        "prompt=none",
      ]);
}

function parseFrontmatter(markdown: string): Record<string, string | string[]> {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const data: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === "---") break;
    if (!trimmed) continue;

    if (currentKey && trimmed.startsWith("- ")) {
      const current = Array.isArray(data[currentKey]) ? [...data[currentKey] as string[]] : [];
      current.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ""));
      data[currentKey] = current;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = match;
    if (!rawValue.trim()) {
      data[key] = [];
      currentKey = key;
      continue;
    }
    data[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
    currentKey = null;
  }

  return data;
}

function parseSection(markdown: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?:\\n## |$)`));
  if (!match) return null;
  return normalize(match[1]);
}

function listMarkdownFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md") && name !== "README.md" && name !== ".gitkeep")
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

function readMarkdownSummary(filePath: string): { title: string; summary: string | null } {
  const content = readFileSync(filePath, "utf8");
  const frontmatter = parseFrontmatter(content);
  return {
    title: String(frontmatter.title ?? frontmatter.id ?? basename(filePath)),
    summary: parseSection(content, "Summary"),
  };
}

function latestMemorySignals(): { devlog: string | null; durable: string | null } {
  const paths = getAiesPaths();
  const devlogPath = listMarkdownFiles(paths.devlogRoot)[0] ?? null;
  const durablePath = [...listMarkdownFiles(paths.knowledgeRoot), ...listMarkdownFiles(paths.theoryForkRoot)]
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] ?? null;

  const devlog = devlogPath ? readMarkdownSummary(devlogPath) : null;
  const durable = durablePath ? readMarkdownSummary(durablePath) : null;

  return {
    devlog: devlog ? shorten(`${devlog.title}: ${devlog.summary ?? "no summary"}`) : null,
    durable: durable ? shorten(`${durable.title}: ${durable.summary ?? "no summary"}`) : null,
  };
}

function renderOpenSpecSection(openSpec: OpenSpecEntry | null): string[] {
  if (!openSpec?.context.activeChangeId) {
    return [
      "OpenSpec context: none",
      "No active change is selected. Fall back to self-maintenance and evolutionary improvement.",
    ];
  }

  return [
    `OpenSpec active change: ${openSpec.context.activeChangeId}`,
    `Current task: ${openSpec.context.currentTaskId ?? "none"}`,
    `Pending tasks: ${openSpec.context.pendingTaskIds.length > 0 ? openSpec.context.pendingTaskIds.join(", ") : "none"}`,
    `Blocked: ${openSpec.context.blocked ? "yes" : "no"}`,
    `Blocked reasons: ${openSpec.context.blockedReasons.length > 0 ? openSpec.context.blockedReasons.join("; ") : "none"}`,
    `Summary: ${openSpec.summary ?? "none"}`,
  ];
}

function renderHeartbeatSection(heartbeat: HeartbeatEntry | null): string[] {
  if (!heartbeat?.currentCycle) {
    return ["Previous cycle state: none"];
  }

  const cycle = heartbeat.currentCycle;
  return [
    `Previous cycle id: ${cycle.cycleId}`,
    `Previous focus: ${cycle.selectedFocus?.focusType ?? "none"}`,
    `Previous rationale: ${cycle.rationale ?? "none"}`,
    `Previous phase: ${cycle.currentPhase}`,
    `Previous related change: ${cycle.activeChangeId ?? "none"}`,
  ];
}

function renderEvaluationSection(entry: EvaluationEntry | null): string[] {
  if (!entry) {
    return ["Evaluation: none"];
  }

  return [
    `Evaluation confidence: ${entry.snapshot.confidence}`,
    `Neglected dimensions: ${entry.snapshot.neglectedDimensions.length > 0 ? entry.snapshot.neglectedDimensions.join(", ") : "none"}`,
    `Drift markers: ${entry.snapshot.driftMarkers.length > 0 ? entry.snapshot.driftMarkers.join(", ") : "none"}`,
    `Recommendation: ${entry.snapshot.recommendation}`,
  ];
}

function renderVerificationSection(entry: VerificationEntry | null, modeEntry: VerificationModeEntry | null): string[] {
  const mode = entry?.record.mode ?? modeEntry?.mode ?? "none";
  if (!entry) {
    return [
      `Verification mode: ${mode}`,
      "Verification follow-up: none",
    ];
  }

  return [
    `Verification mode: ${mode}`,
    `Verification result: ${entry.record.result}`,
    `Verification state: ${entry.record.verificationState}`,
    `Verification follow-up: ${entry.record.followUpRequired ? "required" : "none"}`,
    `Verification suggested commands: ${entry.record.suggestedCommands.length > 0 ? entry.record.suggestedCommands.join(" | ") : "none"}`,
    `Verification failures: ${entry.record.notableFailures.length > 0 ? entry.record.notableFailures.join("; ") : "none"}`,
  ];
}

function renderRecoverySection(entry: RecoveryEntry | null): string[] {
  if (!entry || entry.status !== "open") {
    return ["Recovery debt: none"];
  }

  return [
    `Recovery debt: ${entry.reasonType}/${entry.severity}`,
    `Recovery summary: ${entry.summary}`,
    `Recovery next action: ${entry.recommendedNextAction}`,
    `Recovery suggested commands: ${entry.suggestedCommands.length > 0 ? entry.suggestedCommands.join(" | ") : "none"}`,
  ];
}

function buildCyclePrompt(ctx: ExtensionContext): { prompt: string; summary: string; relatedChangeId: string | null } {
  const heartbeat = restoreHeartbeat(ctx);
  const openSpec = restoreOpenSpecEntry(ctx);
  const evaluation = restoreEvaluationEntry(ctx);
  const verification = restoreVerificationEntry(ctx);
  const recovery = restoreRecoveryEntry(ctx);
  const verificationMode = restoreVerificationModeEntry(ctx);
  const policyMode = restorePolicyModeEntry(ctx)?.mode ?? "advisory";
  const memory = latestMemorySignals();

  const openSpecFirst = Boolean(openSpec?.context.activeChangeId);
  const recoveryFirst = recovery?.status === "open" && (recovery.relatedChangeId === (openSpec?.context.activeChangeId ?? null) || recovery.reasonType === "execution_failed");
  const summary = recoveryFirst
    ? `Address ${recovery?.reasonType ?? "recovery debt"} on ${recovery?.relatedChangeId ?? "current work"}`
    : openSpecFirst
    ? `Continue ${openSpec?.context.activeChangeId} via one explicit cycle`
    : `Run one self-maintenance cycle with explicit rationale`;

  const lines = [
    "Run one AIES self-evolution cycle in this current session.",
    "This prompt is the canonical synthesized cycle request. Treat it as the real user message for this cycle.",
    "Do not search for a queue file, hidden trigger message, or alternate upstream prompt unless the current turn provides concrete evidence that one exists.",
    "This is a single-cycle run. Do one concrete turn, use normal Pi tools if needed, and stop when this turn is complete.",
    `Policy mode: ${policyMode}`,
    openSpecFirst
      ? "Priority rule: prefer continuing the active OpenSpec change unless there is a stronger immediate maintenance reason."
      : "Priority rule: no active OpenSpec change exists, so prefer the best self-maintenance or evolutionary improvement move.",
    recoveryFirst
      ? "Recovery rule: unresolved recovery debt exists for the current work; prefer addressing it if it materially affects trust in the change."
      : "Recovery rule: keep recovery debt visible and advisory, not coercive.",
    "Theory reference rule: use the AIES theory assets below as the canonical conceptual frame for evolution-direction, coherence, intent, evaluation, harness design, and audit posture when they are relevant to the cycle.",
    "",
    "Theory assets:",
    "- docs/foundations/AI-Human-Stack-Component-Reference-Map.md",
    "- docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md",
    "- memory/knowledge/coherence-charter.yaml",
    "- memory/knowledge/intent-hierarchy.yaml",
    "- memory/theory-fork/index.md",
    "- memory/theory-fork/layers/prompt.md",
    "- memory/theory-fork/layers/context.md",
    "- memory/theory-fork/layers/intent.md",
    "- memory/theory-fork/layers/judgment.md",
    "- memory/theory-fork/layers/coherence.md",
    "- memory/theory-fork/meta/evaluation.md",
    "- memory/theory-fork/meta/harness.md",
    "",
    ...renderOpenSpecSection(openSpec),
    "",
    ...renderHeartbeatSection(heartbeat),
    "",
    ...renderEvaluationSection(evaluation),
    "",
    ...renderVerificationSection(verification, verificationMode),
    "",
    ...renderRecoverySection(recovery),
    "",
    `Latest devlog signal: ${memory.devlog ?? "none"}`,
    `Latest durable memory signal: ${memory.durable ?? "none"}`,
    "",
    "Requirements:",
    "- Choose one concrete next step.",
    "- Keep your rationale explicit.",
    "- Continue the active change if it is the best move.",
    "- If there is no active change, choose the best self-maintenance/evolution action from current evidence.",
    "- Do not start a second cycle or outline a long queue of future cycles.",
    "- Leave verification and recovery state visible; do not invent hidden completion criteria.",
    "- Before creating a new user request, first run `/user-requests` and, if needed, `/user-request-status <requestId>` to review prior approvals and denials.",
    "- If you still need operator help, create exactly one explicit request with `/user-request <category> | <summary> | <details>` and avoid repeating previously denied asks unless you have materially new justification.",
    "- If a similar request was previously denied, reference that denial explicitly in the new `/user-request` details and explain what changed before asking again.",
    "- Before writing your final operator-facing summary, check the live verification and recovery state and align your summary with that recorded state.",
    "- If you describe verification or recovery status, prefer the actual AIES status surfaces and recorded state over your own optimistic narrative.",
    "- If the slice is docs-only or explanation-only, say that plainly instead of implying code/runtime verification happened.",
  ];

  return {
    prompt: lines.join("\n"),
    summary,
    relatedChangeId: openSpec?.context.activeChangeId ?? heartbeat?.currentCycle?.activeChangeId ?? null,
  };
}

function formatStatus(entry: CycleRunEntry | null): string {
  if (!entry) {
    return [
      "Cycle runner status: idle",
      "Last run: none",
    ].join("\n");
  }

  return [
    `Run ID: ${entry.runId}`,
    `Status: ${entry.status}`,
    `Source: ${entry.triggerSource}`,
    `Session: ${entry.sessionId}`,
    `Related cycle: ${entry.relatedCycleId ?? "pending"}`,
    `Related change: ${entry.relatedChangeId ?? "none"}`,
    `Prompt summary: ${entry.promptSummary}`,
    `Prompt lines: ${entry.promptText.split(/\r?\n/).length}`,
    `Prompt preview: ${shorten(entry.promptText, 240)}`,
    `Started: ${entry.startedAt}`,
    `Finished: ${entry.finishedAt ?? "in-progress"}`,
    `Failure note: ${entry.failureNote ?? "none"}`,
  ].join("\n");
}

function buildRunEntry(
  runId: string,
  status: CycleRunStatus,
  triggerSource: CycleRunTriggerSource,
  sessionId: string,
  promptSummary: string,
  promptText: string,
  relatedChangeId: string | null,
  failureNote: string | null,
  startedAt: string,
  finishedAt: string | null,
  relatedCycleId: string | null,
): CycleRunEntry {
  return {
    runId,
    status,
    triggerSource,
    sessionId,
    relatedCycleId,
    relatedChangeId,
    promptSummary,
    promptText,
    startedAt,
    finishedAt,
    failureNote,
  };
}

function parseTriggerSource(args: string | undefined): CycleRunTriggerSource {
  const raw = args?.trim() ?? "";
  const match = raw.match(/--source\s+(\S+)/);
  const source = match?.[1]?.trim().toLowerCase();
  return source === OPERATOR_SOURCE ? OPERATOR_SOURCE : DEFAULT_TRIGGER_SOURCE;
}

export default function aiesCycleRunnerExtension(pi: ExtensionAPI): void {
  let activeRun: CycleRunEntry | null = null;

  pi.registerCommand(AIES_COMMANDS.cycleStatus, {
    description: "Show the active or last AIES cycle-runner state",
    handler: async (_args, ctx) => {
      activeRun = restoreCycleRunEntry(ctx);
      updateUi(activeRun, ctx);
      writeLine(ctx, formatStatus(activeRun));
    },
  });

  pi.registerCommand(AIES_COMMANDS.cycleRun, {
    description: "Run one explicit AIES self-evolution cycle in the current session",
    handler: async (args, ctx) => {
      activeRun = restoreCycleRunEntry(ctx);

      if (!ctx.isIdle() || ctx.hasPendingMessages()) {
        const blocked = buildRunEntry(
          createRunId(),
          "blocked",
          parseTriggerSource(args),
          getSessionId(ctx),
          "Cycle run blocked because Pi is already busy.",
          activeRun?.promptText ?? "Cycle run blocked because Pi is already busy.",
          activeRun?.relatedChangeId ?? null,
          "Pi is already processing a turn or has pending messages.",
          nowIso(),
          nowIso(),
          activeRun?.relatedCycleId ?? null,
        );
        activeRun = blocked;
        persistRun(pi, blocked);
        updateUi(activeRun, ctx);
        writeLine(ctx, "Cycle runner is busy; no follow-up was queued.", "warning");
        return;
      }

      const synthesized = buildCyclePrompt(ctx);
      const runId = createRunId();
      const startedAt = nowIso();
      const triggerSource = parseTriggerSource(args);

      activeRun = buildRunEntry(
        runId,
        "requested",
        triggerSource,
        getSessionId(ctx),
        synthesized.summary,
        synthesized.prompt,
        synthesized.relatedChangeId,
        null,
        startedAt,
        null,
        null,
      );
      persistRun(pi, activeRun);

      const running = buildRunEntry(
        runId,
        "running",
        triggerSource,
        getSessionId(ctx),
        synthesized.summary,
        synthesized.prompt,
        synthesized.relatedChangeId,
        null,
        startedAt,
        null,
        null,
      );
      activeRun = running;
      persistRun(pi, running);
      updateUi(activeRun, ctx);

      try {
        pi.sendUserMessage(synthesized.prompt);
        await ctx.waitForIdle();
        activeRun = restoreCycleRunEntry(ctx);
        updateUi(activeRun, ctx);
        writeLine(
          ctx,
          activeRun?.status === "completed"
            ? `Cycle run completed: ${activeRun.promptSummary}`
            : `Cycle run finished with status ${activeRun?.status ?? "unknown"}`,
          activeRun?.status === "failed" ? "error" : "info",
        );
      } catch (error) {
        const failed = buildRunEntry(
          runId,
          "failed",
          triggerSource,
          getSessionId(ctx),
          synthesized.summary,
          synthesized.prompt,
          synthesized.relatedChangeId,
          error instanceof Error ? error.message : String(error),
          startedAt,
          nowIso(),
          null,
        );
        activeRun = failed;
        persistRun(pi, failed);
        updateUi(activeRun, ctx);
        writeLine(ctx, `Cycle run failed to start: ${failed.failureNote}`, "error");
      }
    },
  });

  pi.registerCommand(AIES_COMMANDS.cycleAbort, {
    description: "Abort an in-flight cycle runner turn if one is active",
    handler: async (_args, ctx) => {
      activeRun = restoreCycleRunEntry(ctx);
      if (!activeRun || activeRun.status !== "running" || ctx.isIdle()) {
        updateUi(activeRun, ctx);
        writeLine(ctx, "No in-flight cycle runner turn is active.");
        return;
      }

      ctx.abort();
      const aborted = buildRunEntry(
        activeRun.runId,
        "aborted",
        activeRun.triggerSource,
        getSessionId(ctx),
        activeRun.promptSummary,
        activeRun.promptText,
        activeRun.relatedChangeId,
        "Cycle run aborted by operator command.",
        activeRun.startedAt,
        nowIso(),
        activeRun.relatedCycleId,
      );
      activeRun = aborted;
      persistRun(pi, aborted);
      updateUi(activeRun, ctx);
      writeLine(ctx, "Cycle run abort requested.", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    activeRun = restoreCycleRunEntry(ctx);
    updateUi(activeRun, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    activeRun = restoreCycleRunEntry(ctx);
    updateUi(activeRun, ctx);
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    if (!activeRun || activeRun.status !== "running") {
      activeRun = restoreCycleRunEntry(ctx);
      updateUi(activeRun, ctx);
      return;
    }

    const heartbeat = restoreHeartbeat(ctx);
    const assistantText = latestAssistantText(event.messages);
    const finishedAt = nowIso();
    const relatedChangeId = activeRun.relatedChangeId ?? heartbeat?.currentCycle?.activeChangeId ?? null;
    const relatedCycleId = heartbeat?.currentCycle?.cycleId ?? null;
    const completed = buildRunEntry(
      activeRun.runId,
      assistantText ? "completed" : "failed",
      activeRun.triggerSource,
      getSessionId(ctx),
      activeRun.promptSummary,
      activeRun.promptText,
      relatedChangeId,
      assistantText ? null : "Cycle run ended without assistant output.",
      activeRun.startedAt,
      finishedAt,
      relatedCycleId,
    );
    const thoughtEntry: CycleThoughtEntry = {
      runId: activeRun.runId,
      sessionId: getSessionId(ctx),
      relatedCycleId,
      relatedChangeId,
      startedAt: activeRun.startedAt,
      finishedAt,
      blocks: extractThoughtBlocks(event.messages),
    };
    activeRun = completed;
    persistRun(pi, completed);
    persistThoughts(pi, thoughtEntry);
    updateUi(activeRun, ctx);
  });
}
