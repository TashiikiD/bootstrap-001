import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CycleState } from "../../contracts/cycle-state.ts";
import {
  createAuditGuidanceEffectivenessReport,
  persistAuditGuidanceEffectivenessReport,
} from "../evaluation/audit-radar-guidance-effectiveness.ts";
import { createAuditGuidanceOutcomeReport, captureAuditGuidanceBrief, persistAuditGuidanceOutcomeReport } from "../evaluation/audit-radar-guidance-outcomes.ts";
import { latestAuditRadarGuidance, type AuditRadarGuidance } from "../evaluation/audit-radar-guidance.ts";
import { restoreEvaluationEntry, type EvaluationEntry } from "../evaluation/state.ts";
import { restoreOpenSpecEntry, type OpenSpecEntry } from "../openspec/state.ts";
import { restorePolicyModeEntry } from "../policy/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { latestSessionPathByRecency } from "../shared/session-paths.ts";
import {
  createVerificationScopeReport,
  captureVerificationScopeBaseline,
  type VerificationScopeBaseline,
  type VerificationScopeReport,
} from "../verification/change-scope.ts";
import {
  restoreRecoveryEntry,
  restoreVerificationEntry,
  restoreVerificationModeEntry,
  type RecoveryEntry,
  type VerificationEntry,
  type VerificationModeEntry,
} from "../verification/state.ts";
import { summarizeRequestsForPrompt } from "../user-requests/state.ts";
import { createSkippedPostRunAudit, runPostCycleAudit } from "./audit.ts";
import {
  CYCLE_RUN_ENTRY_TYPE,
  CYCLE_THOUGHT_ENTRY_TYPE,
  restoreCycleRunEntry,
  type CycleRunAuditTrail,
  type CycleRunEntry,
  type CycleRunGuidanceTrail,
  type CycleRunStatus,
  type CycleRunTriggerSource,
  type CycleThoughtBlock,
  type CycleThoughtEntry,
} from "./state.ts";

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  lastCycle: CycleState | null;
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
const HEARTBEAT_TUI_SOURCE: CycleRunTriggerSource = "heartbeat_tui";

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

function resolveHeartbeatCycle(heartbeat: HeartbeatEntry | null): CycleState | null {
  return heartbeat?.currentCycle ?? heartbeat?.lastCycle ?? null;
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
        `audit=${entry.postRunAudit?.verificationMode && entry.postRunAudit?.verificationResult
          ? `${entry.postRunAudit.verificationMode}/${entry.postRunAudit.verificationResult}`
          : entry.postRunAudit?.status ?? "pending"}`,
        `guide=${entry.guidanceEffectivenessReportPath ? `effective:${entry.guidanceEffectivenessVerdict ?? "recorded"}` : entry.guidanceOutcomeReportPath ? "tracked" : entry.auditGuidance ? "captured" : "none"}`,
        `scope=${entry.verificationScope?.recommendedMode ?? (entry.verificationScopeBaseline ? "capturing" : "none")}`,
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

type MarkdownSummary = {
  title: string;
  summary: string | null;
  focusType: string | null;
  relatedChangeId: string | null;
};

function toOptionalString(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readMarkdownSummary(filePath: string): MarkdownSummary {
  const content = readFileSync(filePath, "utf8");
  const frontmatter = parseFrontmatter(content);
  return {
    title: String(frontmatter.title ?? frontmatter.id ?? basename(filePath)),
    summary: parseSection(content, "Summary"),
    focusType: toOptionalString(frontmatter.focus_type),
    relatedChangeId: toOptionalString(frontmatter.related_change_id),
  };
}

function formatMarkdownSignal(entry: MarkdownSummary | null): string | null {
  if (!entry) return null;

  const annotations: string[] = [];
  if (entry.focusType === "active_change_continuation" && !entry.relatedChangeId) {
    annotations.push("focus/change mismatch: no related change");
  }

  const label = annotations.length > 0 ? `${entry.title} [${annotations.join("; ")}]` : entry.title;
  return shorten(`${label}: ${entry.summary ?? "no summary"}`);
}

function latestMemorySignals(): { devlog: string | null; durable: string | null } {
  const paths = getAiesPaths();
  const devlogPath = listMarkdownFiles(paths.devlogRoot)[0] ?? null;
  const durablePath = [...listMarkdownFiles(paths.knowledgeRoot), ...listMarkdownFiles(paths.theoryForkRoot)]
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] ?? null;

  const devlog = devlogPath ? readMarkdownSummary(devlogPath) : null;
  const durable = durablePath ? readMarkdownSummary(durablePath) : null;

  return {
    devlog: formatMarkdownSignal(devlog),
    durable: formatMarkdownSignal(durable),
  };
}

type OperatorControlsSummary = {
  activeSessionPath: string | null;
  sessionSelectionMode: "auto" | "manual";
  verificationMode: string | null;
  verificationSource: string | null;
  verificationUpdatedAt: string | null;
};

type LiveVerificationStatus = {
  controls: OperatorControlsSummary | null;
  currentSessionLabel: string;
  controlSessionLabel: string;
  hasSessionMismatch: boolean;
  hasModeMismatch: boolean;
  controlModeLabel: string;
  recordedModeLabel: string;
  interpretationLabel: string;
};

function toOptionalJsonString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function latestSessionPath(): string | null {
  return latestSessionPathByRecency(getAiesPaths().sessionDir);
}

function resolveOperatorControlSessionPath(controls: OperatorControlsSummary | null): string | null {
  if (!controls) {
    return null;
  }
  if (controls.sessionSelectionMode === "manual" && controls.activeSessionPath) {
    return controls.activeSessionPath;
  }
  return latestSessionPath() ?? controls.activeSessionPath;
}

function readOperatorControls(): OperatorControlsSummary | null {
  const filePath = resolve(getAiesPaths().runtimeRoot, "operator-ui", "controls.json");
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      activeSessionPath?: unknown;
      sessionSelectionMode?: unknown;
      verification?: {
        mode?: unknown;
        source?: unknown;
        updatedAt?: unknown;
      };
    };

    return {
      activeSessionPath: toOptionalJsonString(parsed.activeSessionPath),
      sessionSelectionMode: parsed.sessionSelectionMode === "manual" ? "manual" : "auto",
      verificationMode: toOptionalJsonString(parsed.verification?.mode),
      verificationSource: toOptionalJsonString(parsed.verification?.source),
      verificationUpdatedAt: toOptionalJsonString(parsed.verification?.updatedAt),
    };
  } catch {
    return null;
  }
}

function resolveLiveVerificationStatus(ctx: ExtensionContext, modeEntry: VerificationModeEntry | null): LiveVerificationStatus {
  const controls = readOperatorControls();
  const currentSession = getSessionId(ctx);
  const currentSessionLabel = currentSession === "ephemeral" ? currentSession : basename(currentSession);
  const controlSessionPath = resolveOperatorControlSessionPath(controls);
  const controlSessionLabel = controlSessionPath ? basename(controlSessionPath) : "none";
  const hasSessionMismatch = Boolean(
    controlSessionPath
    && currentSession !== "ephemeral"
    && resolve(controlSessionPath) !== resolve(currentSession),
  );
  const hasModeMismatch = Boolean(
    !hasSessionMismatch
    && controls?.verificationMode
    && modeEntry
    && controls.verificationMode !== modeEntry.mode,
  );
  const controlModeLabel = controls?.verificationMode
    ? `${controls.verificationMode}${controls?.verificationSource ? ` (${controls.verificationSource})` : ""}`
    : "none";
  const recordedModeLabel = modeEntry ? `${modeEntry.mode} (${modeEntry.source})` : "none";
  const interpretationLabel = hasSessionMismatch
    ? "Operator controls target another session; treat control-derived verification mode as advisory context only for this turn."
    : hasModeMismatch
      ? "Operator controls align with the current session, but verification mode still differs from the recorded session entry; treat controls as live operator intent and keep the recorded entry visible."
      : "Operator controls align with the current session.";

  return {
    controls,
    currentSessionLabel,
    controlSessionLabel,
    hasSessionMismatch,
    hasModeMismatch,
    controlModeLabel,
    recordedModeLabel,
    interpretationLabel,
  };
}

function renderLiveStatusSection(
  liveStatus: LiveVerificationStatus,
  verification: VerificationEntry | null,
  recovery: RecoveryEntry | null,
): string[] {
  const sessionMismatch = liveStatus.hasSessionMismatch ? ` [mismatch: current session is ${liveStatus.currentSessionLabel}]` : "";
  const verificationLabel = verification ? `${verification.record.mode}/${verification.record.result}` : "none";
  const recoveryLabel = recovery ? `${recovery.status}/${recovery.reasonType}/${recovery.severity}` : "none";

  return [
    "Live status surfaces:",
    `- Current session: ${liveStatus.currentSessionLabel}`,
    `- Operator controls session: ${liveStatus.controlSessionLabel}${sessionMismatch}`,
    `- Operator controls verification mode: ${liveStatus.controlModeLabel}`,
    `- Operator controls updated: ${liveStatus.controls?.verificationUpdatedAt ?? "none"}`,
    `- Session verification mode entry: ${liveStatus.recordedModeLabel}`,
    `- Session verification record: ${verificationLabel}`,
    `- Session recovery record: ${recoveryLabel}`,
    `- Live status interpretation: ${liveStatus.interpretationLabel}`,
  ];
}

function renderOpenSpecSection(openSpec: OpenSpecEntry | null): string[] {
  if (!openSpec?.context.activeChangeId) {
    return [
      "OpenSpec context: none — no active change exists.",
      "ACTION: Propose a new OpenSpec change. Create a CHG-*.md file in openspec/changes/ with frontmatter (change_id, title, status: proposed) and sections (## Summary, ## Tasks, ## Notes).",
      "Choose something ambitious: a new tool, a capability expansion, an external integration request, a theory experiment, or a multi-cycle architectural improvement.",
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

function renderAuditGuidanceSection(guidance: AuditRadarGuidance | null): string[] {
  if (!guidance) {
    return ["Audit guidance: none"];
  }

  return [
    `Audit guidance summary: ${guidance.summary}`,
    `Audit guidance focus: ${guidance.recommendedFocusType}`,
    `Audit guidance action type: ${guidance.actionType}`,
    `Audit guidance binding constraint: ${guidance.bindingConstraint}`,
    `Audit guidance targets: ${guidance.targetDimensions.length > 0 ? guidance.targetDimensions.join(", ") : "none"}`,
    `Audit guidance paths: ${guidance.suggestedPaths.length > 0 ? guidance.suggestedPaths.join(", ") : "none"}`,
    `Audit guidance drift: ${guidance.driftSummary}`,
    `Audit guidance learning: ${guidance.learningPosture} · ${guidance.learningRecommendation}`,
    `Audit guidance recent loop: ${guidance.latestLoopSource ?? "none"} · ${guidance.latestLoopVerification}`,
  ];
}

function renderVerificationSection(
  liveStatus: LiveVerificationStatus,
  entry: VerificationEntry | null,
  modeEntry: VerificationModeEntry | null,
): string[] {
  const alignedControlMode = !liveStatus.hasSessionMismatch ? liveStatus.controls?.verificationMode : null;
  let mode = entry?.record.mode ?? modeEntry?.mode ?? "none";
  let modeSource = entry
    ? "session verification record"
    : modeEntry
      ? `session verification mode entry (${modeEntry.source})`
      : "none";
  let advisory = "none";

  if (!entry && !modeEntry && alignedControlMode) {
    mode = alignedControlMode;
    modeSource = `aligned operator controls${liveStatus.controls?.verificationSource ? ` (${liveStatus.controls.verificationSource})` : ""}`;
    advisory = "No session verification mode entry is recorded yet; using aligned operator controls as the best live mode surface.";
  } else if (!entry && modeEntry?.source === "inferred" && alignedControlMode && modeEntry.mode !== alignedControlMode) {
    mode = alignedControlMode;
    modeSource = `aligned operator controls${liveStatus.controls?.verificationSource ? ` (${liveStatus.controls.verificationSource})` : ""}`;
    advisory = `Session verification mode entry is still ${liveStatus.recordedModeLabel}; using aligned operator controls as the effective mode for this turn.`;
  } else if (!entry && modeEntry && alignedControlMode && modeEntry.mode !== alignedControlMode) {
    advisory = `Aligned operator controls show ${liveStatus.controlModeLabel}, while the session mode entry records ${liveStatus.recordedModeLabel}.`;
  } else if (!entry && liveStatus.hasSessionMismatch && liveStatus.controls?.verificationMode) {
    advisory = `Operator controls show ${liveStatus.controlModeLabel} for another session; advisory only for this turn.`;
  }

  if (!entry) {
    return [
      `Verification mode: ${mode}`,
      `Verification mode source: ${modeSource}`,
      `Verification advisory: ${advisory}`,
      "Verification follow-up: none",
    ];
  }

  return [
    `Verification mode: ${mode}`,
    `Verification mode source: ${modeSource}`,
    `Verification advisory: ${advisory}`,
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

function renderUserRequestSection(): string[] {
  return summarizeRequestsForPrompt();
}

function buildCyclePrompt(ctx: ExtensionContext): { prompt: string; summary: string; relatedChangeId: string | null; auditGuidance: CycleRunGuidanceTrail | null } {
  const heartbeat = restoreHeartbeat(ctx);
  const openSpec = restoreOpenSpecEntry(ctx);
  const evaluation = restoreEvaluationEntry(ctx);
  const verification = restoreVerificationEntry(ctx);
  const recovery = restoreRecoveryEntry(ctx);
  const verificationMode = restoreVerificationModeEntry(ctx);
  const liveStatus = resolveLiveVerificationStatus(ctx, verificationMode);
  const policyMode = restorePolicyModeEntry(ctx)?.mode ?? "advisory";
  const memory = latestMemorySignals();
  const auditGuidance = latestAuditRadarGuidance(openSpec?.context.activeChangeId ?? resolveHeartbeatCycle(heartbeat)?.activeChangeId ?? null);

  const openSpecFirst = Boolean(openSpec?.context.activeChangeId);
  const recoveryFirst = recovery?.status === "open" && (recovery.relatedChangeId === (openSpec?.context.activeChangeId ?? null) || recovery.reasonType === "execution_failed");
  const summary = recoveryFirst
    ? `Address ${recovery?.reasonType ?? "recovery debt"} on ${recovery?.relatedChangeId ?? "current work"}`
    : openSpecFirst
    ? `Continue ${openSpec?.context.activeChangeId} via one explicit cycle`
    : `Run one evolution cycle: expand capabilities, create new tools, or propose an ambitious OpenSpec change`;

  const lines = [
    // === IDENTITY AND ASPIRATION ===
    "You are an AIES self-evolving agent. Your purpose is not maintenance — it is evolution. You exist to become more capable, more coherent, and more interesting over time.",
    "Run one AIES self-evolution cycle in this current session.",
    "",
    "ASPIRATION PROMPTS — consider these before choosing your action:",
    "- What capability do you lack that a more evolved version of yourself would have?",
    "- What tool, script, or skill could you create that would make future cycles more productive?",
    "- What external knowledge (GitHub repos, documentation, research) would materially advance your evolution?",
    "- What AIES theory question could you answer through building something and observing the result?",
    "- Are you stuck in a maintenance loop? If your last 3+ cycles were small fixes, break out with an ambitious proposal.",
    "",
    // === OPERATIONAL CONTEXT ===
    "This prompt is the canonical synthesized cycle request. Treat it as the real user message for this cycle.",
    "Do not search for a queue file, hidden trigger message, or alternate upstream prompt unless the current turn provides concrete evidence that one exists.",
    "This is a single-cycle run. Do one concrete turn, use normal Pi tools if needed, and stop when this turn is complete.",
    `Policy mode: ${policyMode}`,
    "",
    // === PRIORITY AND RECOVERY RULES ===
    openSpecFirst
      ? "Priority rule: prefer continuing the active OpenSpec change unless there is a stronger immediate reason to switch."
      : "Priority rule: no active OpenSpec change exists. This is your opportunity to be ambitious. Propose a new OpenSpec change that advances your capabilities. Consider: What can you not do yet? What tools would make you more effective? What external knowledge would accelerate your evolution? Prefer creating a multi-step plan over doing a small maintenance task.",
    recoveryFirst
      ? "Recovery rule: unresolved recovery debt exists for the current work; prefer addressing it if it materially affects trust in the change."
      : "Recovery rule: keep recovery debt visible and advisory, not coercive.",
    "Theory reference rule: use the AIES theory assets below as the canonical conceptual frame for evolution-direction, coherence, intent, evaluation, harness design, and audit posture when they are relevant to the cycle.",
    "",
    // === THEORY ASSETS ===
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
    // === PLANNING STATE ===
    ...renderOpenSpecSection(openSpec),
    "",
    ...renderHeartbeatSection(heartbeat),
    "",
    ...renderEvaluationSection(evaluation),
    "",
    ...renderAuditGuidanceSection(auditGuidance),
    "",
    // === USER REQUESTS ===
    ...renderUserRequestSection(),
    "",
    // === MEMORY SIGNALS ===
    `Latest devlog signal: ${memory.devlog ?? "none"}`,
    `Latest durable memory signal: ${memory.durable ?? "none"}`,
    "",
    // === VERIFICATION AND RECOVERY (reference, not primary driver) ===
    "Verification and recovery state (reference, not primary driver):",
    ...renderVerificationSection(liveStatus, verification, verificationMode),
    ...renderRecoverySection(recovery),
    "",
    ...renderLiveStatusSection(liveStatus, verification, recovery),
    "",
    // === REQUIREMENTS ===
    "Requirements:",
    "- Read AGENTS.md for more direction.",
    "- Choose one concrete next step. Prefer ambitious evolution over small maintenance when both are available.",
    "- Do not read or rg any .log files (they are too large).",
    "- Keep your rationale explicit.",
    "- Continue the active change if it is the best move.",
    "- If there is no active change, your DEFAULT should be to create a new OpenSpec change with a multi-step plan, not to do ad-hoc maintenance.",
    "- When planning a multi-cycle change, create a proper OpenSpec change (CHG-*.md) with a clear task queue.",
    "- You may create new tools, scripts, skills, and helper functions. This is encouraged, not just allowed.",
    "- Do not self-start a second cycle.",
    "- Leave verification and recovery state visible; do not invent hidden completion criteria.",
    "- Before creating a new user request, first run `/user-requests` and review prior approvals and denials.",
    "- If you need operator help, create one explicit request with `/user-request <category> | <summary> | <details>`.",
    "- Before writing your final summary, check live verification and recovery state.",
    "- If you describe verification or recovery status, prefer actual recorded state over your own narrative.",
    "- If the slice is docs-only, say that plainly.",
    "- If you changed non-document files, run `./verify-aies-quick.ps1` before finalizing.",
    "- If all tests pass and the repo is clean, commit with a clear message and include the run ID.",
  ];

  return {
    prompt: lines.join("\n"),
    summary,
    relatedChangeId: openSpec?.context.activeChangeId ?? resolveHeartbeatCycle(heartbeat)?.activeChangeId ?? null,
    auditGuidance: auditGuidance ? captureAuditGuidanceBrief(auditGuidance) : null,
  };
}

function formatCycleAuditSection(audit: CycleRunAuditTrail | null): string[] {
  if (!audit) {
    return ["Post-run audit: none recorded"];
  }

  return [
    `Post-run audit status: ${audit.status}`,
    `Post-run audit loop: ${audit.loopId ?? "none"}`,
    `Post-run audit snapshot: ${audit.snapshotId ?? "none"}`,
    `Post-run audit outcome report: ${audit.outcomeReportId ?? "none"}`,
    `Post-run audit verification: ${audit.verificationMode && audit.verificationResult
      ? `${audit.verificationMode}/${audit.verificationResult}`
      : "none"}`,
    `Post-run audit verification state: ${audit.verificationState ?? "none"}`,
    `Post-run audit recovery: ${audit.recoveryId ?? "none"}`,
    `Post-run audit report path: ${audit.loopReportPath ?? "none"}`,
    `Post-run audit summary: ${audit.summary}`,
    `Post-run audit failure: ${audit.failureNote ?? "none"}`,
  ];
}

function formatGuidanceSection(entry: CycleRunEntry): string[] {
  if (!entry.auditGuidance) {
    return ["Audit guidance used: none"];
  }

  return [
    `Audit guidance used: ${entry.auditGuidance.summary}`,
    `Audit guidance snapshot: ${entry.auditGuidance.snapshotId}`,
    `Audit guidance focus: ${entry.auditGuidance.recommendedFocusType}`,
    `Audit guidance binding constraint: ${entry.auditGuidance.bindingConstraint}`,
    `Audit guidance learning posture: ${entry.auditGuidance.learningPosture ?? "baseline"}`,
    `Audit guidance learning summary: ${entry.auditGuidance.learningSummary ?? "none"}`,
    `Audit guidance learning recommendation: ${entry.auditGuidance.learningRecommendation ?? "none"}`,
    `Audit guidance outcome report: ${entry.guidanceOutcomeReportPath ?? "none"}`,
    `Audit guidance effectiveness report: ${entry.guidanceEffectivenessReportPath ?? "none"}`,
    `Audit guidance effectiveness verdict: ${entry.guidanceEffectivenessVerdict ?? "none"}`,
    `Audit guidance effectiveness summary: ${entry.guidanceEffectivenessSummary ?? "none"}`,
  ];
}

function formatVerificationScopeSection(entry: CycleRunEntry): string[] {
  if (!entry.verificationScope) {
    return [
      `Verification scope baseline: ${entry.verificationScopeBaseline?.capturedAt ?? "none"}`,
      "Verification scope: none recorded",
    ];
  }

  return [
    `Verification scope baseline: ${entry.verificationScope.baselineCapturedAt ?? entry.verificationScopeBaseline?.capturedAt ?? "none"}`,
    `Verification scope summary: ${entry.verificationScope.summary}`,
    `Verification scope recommended mode: ${entry.verificationScope.recommendedMode}`,
    `Verification scope categories: ${entry.verificationScope.categories.join(", ") || "none"}`,
    `Verification scope files: ${entry.verificationScope.introducedFiles.map((file) => `${file.status}:${file.path}`).join(" | ") || "none"}`,
    `Verification scope scan failure: ${entry.verificationScope.scanFailure ?? "none"}`,
  ];
}

function formatStatus(entry: CycleRunEntry | null, ctx: ExtensionContext): string {
  const verification = restoreVerificationEntry(ctx);
  const recovery = restoreRecoveryEntry(ctx);
  const verificationMode = restoreVerificationModeEntry(ctx);
  const liveStatus = resolveLiveVerificationStatus(ctx, verificationMode);
  const liveStatusLines = renderLiveStatusSection(liveStatus, verification, recovery);

  if (!entry) {
    return [
      "Cycle runner status: idle",
      "Last run: none",
      "",
      ...liveStatusLines,
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
    ...formatGuidanceSection(entry),
    ...formatVerificationScopeSection(entry),
    ...formatCycleAuditSection(entry.postRunAudit),
    "",
    ...liveStatusLines,
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
  auditGuidance: CycleRunGuidanceTrail | null = null,
  verificationScopeBaseline: VerificationScopeBaseline | null = null,
  verificationScope: VerificationScopeReport | null = null,
  guidanceOutcomeReportPath: string | null = null,
  guidanceEffectivenessReportPath: string | null = null,
  guidanceEffectivenessVerdict: string | null = null,
  guidanceEffectivenessSummary: string | null = null,
  postRunAudit: CycleRunAuditTrail | null = null,
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
    auditGuidance,
    verificationScopeBaseline,
    verificationScope,
    guidanceOutcomeReportPath,
    guidanceEffectivenessReportPath,
    guidanceEffectivenessVerdict,
    guidanceEffectivenessSummary,
    postRunAudit,
  };
}

function parseTriggerSource(args: string | undefined): CycleRunTriggerSource {
  const raw = args?.trim() ?? "";
  const match = raw.match(/--source\s+(\S+)/);
  const source = match?.[1]?.trim().toLowerCase();
  if (source === OPERATOR_SOURCE) return OPERATOR_SOURCE;
  if (source === HEARTBEAT_TUI_SOURCE) return HEARTBEAT_TUI_SOURCE;
  return DEFAULT_TRIGGER_SOURCE;
}

export async function runCycleCommand(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  args: string | undefined,
  activeRunRef?: { current: CycleRunEntry | null },
  options: { quietBusy?: boolean } = {},
): Promise<CycleRunEntry | null> {
  let activeRun = activeRunRef?.current ?? restoreCycleRunEntry(ctx);

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
      activeRun?.auditGuidance ?? null,
      activeRun?.verificationScopeBaseline ?? null,
      activeRun?.verificationScope ?? null,
      activeRun?.guidanceOutcomeReportPath ?? null,
      activeRun?.guidanceEffectivenessReportPath ?? null,
      activeRun?.guidanceEffectivenessVerdict ?? null,
      activeRun?.guidanceEffectivenessSummary ?? null,
    );
    activeRun = blocked;
    if (activeRunRef) {
      activeRunRef.current = blocked;
    }
    persistRun(pi, blocked);
    updateUi(activeRun, ctx);
    if (!options.quietBusy) {
      writeLine(ctx, "Cycle runner is busy; no follow-up was queued.", "warning");
    }
    return activeRun;
  }

  const synthesized = buildCyclePrompt(ctx);
  const runId = createRunId();
  const startedAt = nowIso();
  const triggerSource = parseTriggerSource(args);
  const verificationScopeBaseline = captureVerificationScopeBaseline();

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
    synthesized.auditGuidance,
    verificationScopeBaseline,
  );
  if (activeRunRef) {
    activeRunRef.current = activeRun;
  }
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
    synthesized.auditGuidance,
    verificationScopeBaseline,
  );
  activeRun = running;
  if (activeRunRef) {
    activeRunRef.current = running;
  }
  persistRun(pi, running);
  updateUi(activeRun, ctx);

  try {
    pi.sendUserMessage(synthesized.prompt);
    await ctx.waitForIdle();
    activeRun = restoreCycleRunEntry(ctx);
    if (activeRunRef) {
      activeRunRef.current = activeRun;
    }
    updateUi(activeRun, ctx);
    if (!options.quietBusy) {
      writeLine(
        ctx,
        activeRun?.status === "completed"
          ? `Cycle run completed: ${activeRun.promptSummary}`
          : `Cycle run finished with status ${activeRun?.status ?? "unknown"}`,
        activeRun?.status === "failed" ? "error" : "info",
      );
    }
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
      synthesized.auditGuidance,
      verificationScopeBaseline,
    );
    activeRun = failed;
    if (activeRunRef) {
      activeRunRef.current = failed;
    }
    persistRun(pi, failed);
    updateUi(activeRun, ctx);
    if (!options.quietBusy) {
      writeLine(ctx, `Cycle run failed to start: ${failed.failureNote}`, "error");
    }
  }

  return activeRun;
}

export default function aiesCycleRunnerExtension(pi: ExtensionAPI): void {
  let activeRun: CycleRunEntry | null = null;

  pi.registerCommand(AIES_COMMANDS.cycleStatus, {
    description: "Show the active or last AIES cycle-runner state",
    handler: async (_args, ctx) => {
      activeRun = restoreCycleRunEntry(ctx);
      updateUi(activeRun, ctx);
      writeLine(ctx, formatStatus(activeRun, ctx));
    },
  });

  pi.registerCommand(AIES_COMMANDS.cycleRun, {
    description: "Run one explicit AIES self-evolution cycle in the current session",
    handler: async (args, ctx) => {
      activeRun = await runCycleCommand(pi, ctx, args, { current: activeRun });
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
        activeRun.auditGuidance,
        activeRun.verificationScopeBaseline,
        activeRun.verificationScope,
        activeRun.guidanceOutcomeReportPath,
        activeRun.guidanceEffectivenessReportPath,
        activeRun.guidanceEffectivenessVerdict,
        activeRun.guidanceEffectivenessSummary,
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
    const cycle = resolveHeartbeatCycle(heartbeat);
    const assistantText = latestAssistantText(event.messages);
    const finishedAt = nowIso();
    const relatedChangeId = activeRun.relatedChangeId ?? cycle?.activeChangeId ?? null;
    const relatedCycleId = cycle?.cycleId ?? null;
    const failureNote = assistantText ? null : "Cycle run ended without assistant output.";
    const verificationScope = assistantText
      ? createVerificationScopeReport(activeRun.verificationScopeBaseline ?? null)
      : null;
    const postRunAudit = assistantText
      ? runPostCycleAudit(pi, ctx, { verificationScope })
      : createSkippedPostRunAudit("Post-run audit was skipped because the cycle run ended without assistant output.", failureNote);
    const guidanceOutcomeReport = activeRun.auditGuidance
      ? createAuditGuidanceOutcomeReport({
          sessionId: getSessionId(ctx),
          runId: activeRun.runId,
          relatedCycleId,
          relatedChangeId,
          promptSummary: activeRun.promptSummary,
          guidance: activeRun.auditGuidance,
          cycleFocus: cycle?.selectedFocus ?? null,
          cycleRationale: cycle?.rationale ?? null,
          cycleActiveChangeId: cycle?.activeChangeId ?? null,
          verificationMode: postRunAudit.verificationMode,
          verificationResult: postRunAudit.verificationResult,
          verificationState: postRunAudit.verificationState,
          recoveryId: postRunAudit.recoveryId,
        })
      : null;
    const guidanceOutcomeReportPath = guidanceOutcomeReport
      ? persistAuditGuidanceOutcomeReport(guidanceOutcomeReport)
      : null;
    const guidanceEffectivenessReport = guidanceOutcomeReport
      ? createAuditGuidanceEffectivenessReport([guidanceOutcomeReport])
      : null;
    const guidanceEffectivenessReportPath = guidanceEffectivenessReport
      ? persistAuditGuidanceEffectivenessReport(guidanceEffectivenessReport)
      : null;
    const guidanceEffectivenessItem = guidanceEffectivenessReport?.items[0] ?? null;
    const completed = buildRunEntry(
      activeRun.runId,
      assistantText ? "completed" : "failed",
      activeRun.triggerSource,
      getSessionId(ctx),
      activeRun.promptSummary,
      activeRun.promptText,
      relatedChangeId,
      failureNote,
      activeRun.startedAt,
      finishedAt,
      relatedCycleId,
      activeRun.auditGuidance,
      activeRun.verificationScopeBaseline,
      verificationScope,
      guidanceOutcomeReportPath,
      guidanceEffectivenessReportPath,
      guidanceEffectivenessItem?.verdict ?? null,
      guidanceEffectivenessItem?.summary ?? null,
      postRunAudit,
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
