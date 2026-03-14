import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CycleState } from "../../contracts/cycle-state.ts";
import type { MemoryEvent } from "../../contracts/memory-event.ts";
import { restoreEvaluationEntry, type EvaluationEntry } from "../evaluation/state.ts";
import type { VerificationRecord } from "../../contracts/verification-record.ts";
import { restoreRecoveryEntry, type RecoveryEntry } from "../verification/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";

type AgentEndEvent = {
  messages: AgentMessage[];
};

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  completedCycles: number;
  lastPromptText: string | null;
  lastAssistantText: string | null;
  lastCompletedAt: string | null;
};

type MemoryCandidate = {
  event: MemoryEvent;
  title: string;
  bodySummary: string;
  tags: string[];
  sessionId: string;
  focusType: string;
};

type LatestMemoryFiles = {
  devlog: string | null;
  knowledge: string | null;
  theoryFork: string | null;
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const COMMAND_PREFIX = "/";

function nowIso(): string {
  return new Date().toISOString();
}

function timestampSlug(timestamp: string): string {
  return timestamp.replace(/[:.]/g, "-");
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 140): string {
  const compact = normalize(text);
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function toTitleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function slugify(text: string): string {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "note";
}

function quoteYaml(value: string | null): string {
  return JSON.stringify(value ?? "");
}

function yamlList(values: string[]): string[] {
  if (values.length === 0) {
    return ["[]"];
  }
  return values.map((value) => `  - ${quoteYaml(value)}`);
}

function getMessageText(message: AgentMessage | undefined): string {
  if (!message || !("content" in message) || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter((block): block is TextContent => typeof block === "object" && block !== null && "type" in block && block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function getLatestUserText(messages: AgentMessage[]): string {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  return getMessageText(userMessage);
}

function getLatestAssistantText(messages: AgentMessage[]): string {
  const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  return getMessageText(assistantMessage);
}

function restoreHeartbeat(ctx: ExtensionContext): HeartbeatEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const heartbeatEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  return heartbeatEntry?.data ?? null;
}

function ensureMemoryDirectories(): ReturnType<typeof getAiesPaths> {
  const paths = getAiesPaths();
  mkdirSync(paths.devlogRoot, { recursive: true });
  mkdirSync(paths.knowledgeRoot, { recursive: true });
  mkdirSync(paths.theoryForkRoot, { recursive: true });
  return paths;
}

function readLatestMarkdownFile(directory: string): string | null {
  const entries = readdirSync(directory)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => ({ name, fullPath: join(directory, name), mtimeMs: statSync(join(directory, name)).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return entries[0]?.fullPath ?? null;
}

function latestFiles(paths: ReturnType<typeof getAiesPaths>): LatestMemoryFiles {
  return {
    devlog: readLatestMarkdownFile(paths.devlogRoot),
    knowledge: readLatestMarkdownFile(paths.knowledgeRoot),
    theoryFork: readLatestMarkdownFile(paths.theoryForkRoot),
  };
}

function parseFrontmatterValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}:\s*(.+)$`, "m"));
  if (!match) return null;
  return match[1].trim().replace(/^"|"$/g, "");
}

function parseSection(content: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)(?:\\n## |$)`));
  if (!match) return null;
  return normalize(match[1]);
}

function isMemoryCommand(promptText: string): boolean {
  return promptText.trim().startsWith(COMMAND_PREFIX);
}

function buildDevlogFrontmatter(
  cycle: CycleState,
  createdAt: string,
): string[] {
  return [
    "---",
    `id: ${quoteYaml(`devlog-${cycle.cycleId}`)}`,
    `kind: ${quoteYaml("devlog")}`,
    `created_at: ${quoteYaml(createdAt)}`,
    `cycle_id: ${quoteYaml(cycle.cycleId)}`,
    `session_id: ${quoteYaml(cycle.sessionId)}`,
    `focus_type: ${quoteYaml(cycle.selectedFocus?.focusType ?? "other")}`,
    `related_change_id: ${quoteYaml(cycle.activeChangeId ?? "")}`,
    `evaluation_snapshot_id: ${quoteYaml(cycle.evaluationSnapshotId ?? "")}`,
    `verification_mode: ${quoteYaml(cycle.verification?.mode ?? "none")}`,
    `verification_result: ${quoteYaml(cycle.verification?.result ?? "not_run")}`,
    `source: ${quoteYaml("heartbeat")}`,
    `sensitivity: ${quoteYaml("internal")}`,
    "---",
  ];
}

function formatVerificationSection(record: VerificationRecord | null): string {
  if (!record) {
    return "mode: none\nresult: not_run\nstate: no_verification_needed\ncommands: none\nsuggested_commands: none\nfollow_up_required: false\nnotable_failures: none";
  }

  return [
    `mode: ${record.mode}`,
    `result: ${record.result}`,
    `state: ${record.verificationState}`,
    `commands: ${record.commands.length > 0 ? record.commands.join(" | ") : "none"}`,
    `suggested_commands: ${record.suggestedCommands.length > 0 ? record.suggestedCommands.join(" | ") : "none"}`,
    `follow_up_required: ${record.followUpRequired}`,
    `notable_failures: ${record.notableFailures.length > 0 ? record.notableFailures.join("; ") : "none"}`,
  ].join("\n");
}

function formatRecoverySection(entry: RecoveryEntry | null): string {
  if (!entry || entry.status !== "open") {
    return "status: none\nreason: none\nseverity: none\nrecommended_next_action: none\nsuggested_commands: none";
  }

  return [
    `status: ${entry.status}`,
    `reason: ${entry.reasonType}`,
    `severity: ${entry.severity}`,
    `recommended_next_action: ${entry.recommendedNextAction}`,
    `suggested_commands: ${entry.suggestedCommands.length > 0 ? entry.suggestedCommands.join(" | ") : "none"}`,
  ].join("\n");
}

function formatEvaluationSection(entry: EvaluationEntry | null): string {
  if (!entry) {
    return "none";
  }

  const neglected = entry.snapshot.neglectedDimensions.length > 0 ? entry.snapshot.neglectedDimensions.join(", ") : "none";
  const drift = entry.snapshot.driftMarkers.length > 0 ? entry.snapshot.driftMarkers.join(", ") : "none";
  return [
    `snapshot: ${entry.snapshot.snapshotId}`,
    `confidence: ${entry.snapshot.confidence}`,
    `neglected: ${neglected}`,
    `drift: ${drift}`,
    `recommendation: ${entry.snapshot.recommendation}`,
  ].join("\n");
}

function buildDevlogBody(
  cycle: CycleState,
  promptText: string,
  assistantText: string,
  memoryCandidates: string[],
  evaluationEntry: EvaluationEntry | null,
  recoveryEntry: RecoveryEntry | null,
): string {
  const summary = shorten(assistantText || promptText || cycle.rationale || "Cycle completed.");
  const focus = toTitleCase(cycle.selectedFocus?.focusType ?? "other");
  const rationale = cycle.rationale ?? cycle.selectedFocus?.justification ?? "No rationale captured.";
  const candidateLines = memoryCandidates.length > 0 ? memoryCandidates.map((item) => `- ${item}`).join("\n") : "none";

  return [
    "## Summary",
    summary,
    "",
    "## Focus",
    focus,
    "",
    "## Rationale",
    rationale,
    "",
    "## Prompt Evidence",
    promptText || "No prompt evidence captured.",
    "",
    "## Assistant Outcome",
    assistantText || "No assistant outcome captured.",
    "",
    "## Verification",
    formatVerificationSection(cycle.verification),
    "",
    "## Recovery",
    formatRecoverySection(recoveryEntry),
    "",
    "## Evaluation",
    formatEvaluationSection(evaluationEntry),
    "",
    "## Memory Candidates",
    candidateLines,
    "",
  ].join("\n");
}

function buildDurableFrontmatter(candidate: MemoryCandidate): string[] {
  return [
    "---",
    `id: ${quoteYaml(candidate.event.eventId)}`,
    `title: ${quoteYaml(candidate.title)}`,
    `kind: ${quoteYaml(candidate.event.kind)}`,
    `created_at: ${quoteYaml(candidate.event.createdAt)}`,
    `cycle_id: ${quoteYaml(candidate.event.relatedCycleId ?? "")}`,
    `session_id: ${quoteYaml(candidate.sessionId)}`,
    `focus_type: ${quoteYaml(candidate.focusType)}`,
    `sensitivity: ${quoteYaml(candidate.event.sensitivity)}`,
    `related_change_id: ${quoteYaml(candidate.event.relatedChangeId ?? "")}`,
    "source_evidence:",
    ...yamlList(candidate.event.sourceEvidence),
    "tags:",
    ...yamlList(candidate.tags),
    "---",
  ];
}

function buildDurableBody(candidate: MemoryCandidate): string {
  return [
    "## Summary",
    candidate.bodySummary,
    "",
    "## Why This Is Durable",
    candidate.event.summary,
    "",
    "## Evidence",
    candidate.event.sourceEvidence.map((item) => `- ${item}`).join("\n"),
    "",
  ].join("\n");
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function detectDurableCandidate(cycle: CycleState, promptText: string, assistantText: string): MemoryCandidate | null {
  const combined = `${promptText}\n${assistantText}`.toLowerCase();
  const createdAt = nowIso();
  const focusLabel = toTitleCase(cycle.selectedFocus?.focusType ?? "other");

  if (hasAny(combined, ["decision", "we should", "we will", "chosen", "canonical", "adopt", "use "])) {
    return {
      event: {
        eventId: `memory-${cycle.cycleId}-decision`,
        kind: "decision",
        summary: "Cycle contains a concrete decision worth preserving.",
        sourceEvidence: [shorten(promptText), shorten(assistantText)].filter(Boolean),
        persistenceTarget: "knowledge",
        sensitivity: "internal",
        relatedCycleId: cycle.cycleId,
        relatedChangeId: cycle.activeChangeId,
        createdAt,
      },
      title: `${focusLabel} decision`,
      bodySummary: shorten(assistantText || promptText || cycle.rationale || "Decision captured."),
      tags: ["decision", "aiesv2", slugify(cycle.selectedFocus?.focusType ?? "other")],
      sessionId: cycle.sessionId,
      focusType: cycle.selectedFocus?.focusType ?? "other",
    };
  }

  if (hasAny(combined, ["lesson", "learned", "root cause", "pattern", "avoid", "works because"])) {
    return {
      event: {
        eventId: `memory-${cycle.cycleId}-lesson`,
        kind: "lesson",
        summary: "Cycle contains a reusable lesson or pattern.",
        sourceEvidence: [shorten(promptText), shorten(assistantText)].filter(Boolean),
        persistenceTarget: "knowledge",
        sensitivity: "internal",
        relatedCycleId: cycle.cycleId,
        relatedChangeId: cycle.activeChangeId,
        createdAt,
      },
      title: `${focusLabel} lesson`,
      bodySummary: shorten(assistantText || promptText || cycle.rationale || "Lesson captured."),
      tags: ["lesson", "pattern", "aiesv2", slugify(cycle.selectedFocus?.focusType ?? "other")],
      sessionId: cycle.sessionId,
      focusType: cycle.selectedFocus?.focusType ?? "other",
    };
  }

  if (hasAny(combined, ["theory", "framework", "coherence", "judgment", "self-evolution", "guidance", "constraint"])) {
    return {
      event: {
        eventId: `memory-${cycle.cycleId}-theory`,
        kind: "theory_note",
        summary: "Cycle contains a conceptual reflection relevant to the theory fork.",
        sourceEvidence: [shorten(promptText), shorten(assistantText)].filter(Boolean),
        persistenceTarget: "theory_fork",
        sensitivity: "internal",
        relatedCycleId: cycle.cycleId,
        relatedChangeId: cycle.activeChangeId,
        createdAt,
      },
      title: `${focusLabel} theory note`,
      bodySummary: shorten(assistantText || promptText || cycle.rationale || "Theory note captured."),
      tags: ["theory", "aiesv2", slugify(cycle.selectedFocus?.focusType ?? "other")],
      sessionId: cycle.sessionId,
      focusType: cycle.selectedFocus?.focusType ?? "other",
    };
  }

  return null;
}

function writeMarkdownFile(directory: string, filename: string, frontmatter: string[], body: string): string {
  const fullPath = join(directory, filename);
  writeFileSync(fullPath, `${frontmatter.join("\n")}\n${body}`);
  return fullPath;
}

function writeDevlog(
  paths: ReturnType<typeof getAiesPaths>,
  cycle: CycleState,
  promptText: string,
  assistantText: string,
  candidate: MemoryCandidate | null,
  evaluationEntry: EvaluationEntry | null,
  recoveryEntry: RecoveryEntry | null,
): string {
  const createdAt = nowIso();
  const filename = `${timestampSlug(createdAt)}-${cycle.cycleId}.md`;
  const frontmatter = buildDevlogFrontmatter(cycle, createdAt);
  const body = buildDevlogBody(
    cycle,
    promptText,
    assistantText,
    candidate ? [`${candidate.event.persistenceTarget}: ${candidate.title}`] : [],
    evaluationEntry,
    recoveryEntry,
  );
  return writeMarkdownFile(paths.devlogRoot, filename, frontmatter, body);
}

function writeDurable(paths: ReturnType<typeof getAiesPaths>, candidate: MemoryCandidate): string {
  const filename = `${timestampSlug(candidate.event.createdAt)}-${slugify(candidate.title)}.md`;
  const frontmatter = buildDurableFrontmatter(candidate);
  const body = buildDurableBody(candidate);
  const directory = candidate.event.persistenceTarget === "theory_fork" ? paths.theoryForkRoot : paths.knowledgeRoot;
  return writeMarkdownFile(directory, filename, frontmatter, body);
}

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function updateStatus(paths: ReturnType<typeof getAiesPaths>, ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }
  const files = latestFiles(paths);
  const latestName = files.devlog ? basename(files.devlog) : "none";
  ctx.ui.setStatus(AIES_STATUS_KEYS.memory, ctx.ui.theme.fg("accent", `memory:${latestName}`));
}

function formatMemoryStatus(paths: ReturnType<typeof getAiesPaths>): string {
  const files = latestFiles(paths);
  const devlogCount = readdirSync(paths.devlogRoot).filter((name) => name.endsWith(".md") && name !== "README.md").length;
  const knowledgeCount = readdirSync(paths.knowledgeRoot).filter((name) => name.endsWith(".md")).length;
  const theoryCount = readdirSync(paths.theoryForkRoot).filter((name) => name.endsWith(".md")).length;

  return [
    `Devlog entries: ${devlogCount}`,
    `Knowledge notes: ${knowledgeCount}`,
    `Theory notes: ${theoryCount}`,
    `Latest devlog: ${files.devlog ? basename(files.devlog) : "none"}`,
    `Latest knowledge: ${files.knowledge ? basename(files.knowledge) : "none"}`,
    `Latest theory-fork: ${files.theoryFork ? basename(files.theoryFork) : "none"}`,
  ].join("\n");
}

function formatLastMemory(paths: ReturnType<typeof getAiesPaths>): string {
  const files = latestFiles(paths);
  const sections: string[] = [];

  if (files.devlog) {
    const content = readFileSync(files.devlog, "utf8");
    sections.push(`Latest devlog: ${basename(files.devlog)}`);
    sections.push(`Summary: ${parseSection(content, "Summary") ?? "No summary captured"}`);
  } else {
    sections.push("Latest devlog: none");
  }

  const durable = files.knowledge ?? files.theoryFork;
  if (durable) {
    const content = readFileSync(durable, "utf8");
    sections.push(`Latest durable memory: ${basename(durable)}`);
    sections.push(`Title: ${parseFrontmatterValue(content, "title") ?? "untitled"}`);
    sections.push(`Kind: ${parseFrontmatterValue(content, "kind") ?? "unknown"}`);
    sections.push(`Summary: ${parseSection(content, "Summary") ?? "No summary captured"}`);
  } else {
    sections.push("Latest durable memory: none");
  }

  return sections.join("\n");
}

export default function aiesMemoryExtension(pi: ExtensionAPI): void {
  const paths = ensureMemoryDirectories();

  pi.registerCommand(AIES_COMMANDS.memoryStatus, {
    description: "Show AIES memory counts and latest artifacts",
    handler: async (_args, ctx) => {
      updateStatus(paths, ctx);
      writeLine(ctx, formatMemoryStatus(paths));
    },
  });

  pi.registerCommand(AIES_COMMANDS.memoryLast, {
    description: "Show the latest AIES devlog and durable memory summaries",
    handler: async (_args, ctx) => {
      updateStatus(paths, ctx);
      writeLine(ctx, formatLastMemory(paths));
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    updateStatus(paths, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    updateStatus(paths, ctx);
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    const heartbeat = restoreHeartbeat(ctx);
    const cycle = heartbeat?.currentCycle;
    if (!cycle) {
      return;
    }

    const promptText = getLatestUserText(event.messages) || heartbeat?.lastPromptText || "";
    if (isMemoryCommand(promptText)) {
      updateStatus(paths, ctx);
      return;
    }

    const assistantText = getLatestAssistantText(event.messages) || heartbeat?.lastAssistantText || "";
    const candidate = detectDurableCandidate(cycle, promptText, assistantText);
    const evaluationEntry = restoreEvaluationEntry(ctx);
    const recoveryEntry = restoreRecoveryEntry(ctx);

    writeDevlog(paths, cycle, promptText, assistantText, candidate, evaluationEntry, recoveryEntry);
    if (candidate) {
      writeDurable(paths, candidate);
    }

    updateStatus(paths, ctx);
  });
}
