import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CycleState } from "../../contracts/cycle-state.ts";
import type {
  FocusType,
  RecoveryReasonType,
  RecoverySeverity,
  VerificationMode,
  VerificationResult,
  VerificationState,
} from "../../contracts/primitives.ts";
import type { VerificationRecord } from "../../contracts/verification-record.ts";
import { restoreOpenSpecEntry } from "../openspec/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import {
  RECOVERY_ENTRY_TYPE,
  VERIFICATION_ENTRY_TYPE,
  VERIFICATION_MODE_ENTRY_TYPE,
  restoreOpenRecoveryEntries,
  restoreRecoveryEntry,
  restoreRecoveryHistory,
  restoreVerificationEntry,
  restoreVerificationHistory,
  restoreVerificationModeEntry,
  type RecoveryEntry,
  type VerificationEntry,
  type VerificationModeEntry,
} from "./state.ts";

type BeforeAgentStartEvent = {
  prompt?: string;
  systemPrompt: string;
};

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

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const COMMAND_PREFIX = "/";
const VERIFICATION_MODES = new Set<VerificationMode>(["none", "targeted", "fast", "full"]);
const VERIFICATION_RESULTS = new Set<VerificationResult>(["not_run", "passed", "failed", "partial"]);

function nowIso(): string {
  return new Date().toISOString();
}

function createRecordId(): string {
  return `ver-${Date.now()}`;
}

function createRecoveryId(): string {
  return `recovery-${Date.now()}`;
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

function getMessageText(message: AgentMessage | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function getLatestUserText(messages: AgentMessage[]): string {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  return getMessageText(userMessage);
}

function restoreHeartbeat(ctx: ExtensionContext): HeartbeatEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const heartbeatEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  return heartbeatEntry?.data ?? null;
}

function persistHeartbeat(pi: ExtensionAPI, state: HeartbeatEntry): void {
  pi.appendEntry(HEARTBEAT_ENTRY_TYPE, state);
}

function persistModeEntry(pi: ExtensionAPI, entry: VerificationModeEntry): void {
  pi.appendEntry(VERIFICATION_MODE_ENTRY_TYPE, entry);
}

function persistVerificationEntry(pi: ExtensionAPI, entry: VerificationEntry): void {
  pi.appendEntry(VERIFICATION_ENTRY_TYPE, entry);
}

function persistRecoveryEntry(pi: ExtensionAPI, entry: RecoveryEntry): void {
  pi.appendEntry(RECOVERY_ENTRY_TYPE, entry);
}

function isCommandPrompt(promptText: string): boolean {
  return promptText.trim().startsWith(COMMAND_PREFIX);
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function parseVerificationMode(rawValue: string | undefined): VerificationMode | null {
  if (!rawValue) return null;
  const normalized = rawValue.trim().toLowerCase() as VerificationMode;
  return VERIFICATION_MODES.has(normalized) ? normalized : null;
}

function parseVerificationResult(rawValue: string | undefined): VerificationResult | null {
  if (!rawValue) return null;
  const normalized = rawValue.trim().toLowerCase() as VerificationResult;
  return VERIFICATION_RESULTS.has(normalized) ? normalized : null;
}

function inferModeFromFocus(focus: FocusType | null): VerificationMode | null {
  if (!focus) return null;
  if (focus === "memory_theory_consolidation") return "none";
  if (focus === "repair_self_heal" || focus === "architecture_simplification" || focus === "weak_dimension_improvement") return "targeted";
  if (focus === "active_change_continuation") return "fast";
  return null;
}

function inferVerificationMode(cycle: CycleState | null, promptText: string, hasActiveChange: boolean): VerificationMode {
  if (!cycle) {
    return "none";
  }

  const focusMode = inferModeFromFocus(cycle.selectedFocus?.focusType ?? null);
  if (focusMode) {
    return focusMode;
  }

  const prompt = promptText.toLowerCase();
  if (includesAny(prompt, ["plan", "explain", "discuss", "summarize", "review only", "reflect"])) {
    return "none";
  }
  if (includesAny(prompt, ["full verification", "full test", "full suite", "full check"])) {
    return "full";
  }
  if (hasActiveChange && includesAny(prompt, ["implement", "wire", "integrate", "continue", "build", "add", "update"])) {
    return "fast";
  }
  if (includesAny(prompt, ["fix", "repair", "refactor", "patch", "debug", "config"])) {
    return "targeted";
  }
  return hasActiveChange ? "fast" : "none";
}

function buildSuggestedCommands(mode: VerificationMode, cycle: CycleState | null, promptText: string): string[] {
  const prompt = promptText.toLowerCase();
  if (mode === "none") return [];
  if (includesAny(prompt, ["doc", "markdown", "readme", "plan", "spec", "theory", "reflect"])) {
    return [];
  }

  const commands: string[] = [];
  if (mode === "targeted") {
    commands.push("Run one targeted check covering the edited area.");
  }
  if (mode === "fast") {
    commands.push("Run a representative fast verification command for the active slice.");
  }
  if (mode === "full") {
    commands.push("Run the full verification suite for the active change.");
  }

  if (cycle?.activeChangeId) {
    commands.push(`Prefer checks that validate ${cycle.activeChangeId}.`);
  }

  if (includesAny(prompt, ["config", "provider", "runtime", "session"])) {
    commands.push("Verify the affected runtime path with one focused smoke check.");
  }

  return [...new Set(commands)];
}

function classifyVerificationState(mode: VerificationMode, result: VerificationResult): VerificationState {
  if (mode === "none") return "no_verification_needed";
  if (result === "passed") return "verified";
  if (result === "failed") return "failed_verification";
  if (result === "partial" || result === "not_run") return "under_verified";
  return "verification_blocked";
}

function updateHeartbeatVerification(pi: ExtensionAPI, heartbeat: HeartbeatEntry, record: VerificationRecord): HeartbeatEntry {
  if (!heartbeat.currentCycle) {
    return heartbeat;
  }

  const nextHeartbeat: HeartbeatEntry = {
    ...heartbeat,
    currentCycle: {
      ...heartbeat.currentCycle,
      verification: record,
      updatedAt: nowIso(),
    },
  };

  persistHeartbeat(pi, nextHeartbeat);
  return nextHeartbeat;
}

function buildRecoveryNote(record: VerificationRecord, relatedChangeId: string | null): string | null {
  if (!record.followUpRequired) {
    return null;
  }

  const target = relatedChangeId ? ` for ${relatedChangeId}` : "";
  if (record.result === "failed") {
    return `Verification failed${target}; review failures and rerun proportionate checks.`;
  }
  if (record.result === "partial") {
    return `Verification is partial${target}; complete the remaining checks before treating the slice as settled.`;
  }
  if (record.result === "not_run") {
    return `Verification was not run${target}; run proportionate checks before treating the slice as trusted.`;
  }
  return null;
}

function buildPlanSummary(mode: VerificationMode, commands: string[]): string | null {
  if (mode === "none") return "No verification is needed for this cycle.";
  if (commands.length === 0) return `Use ${mode} verification if the slice materially changed code or runtime behavior.`;
  return `${mode} verification recommended: ${commands.join(" ")}`;
}

function createVerificationRecord(mode: VerificationMode, result: VerificationResult, commandSummary: string, failureSummary: string, cycle: CycleState | null, promptText: string): VerificationRecord {
  const commands = commandSummary.trim() ? [commandSummary.trim()] : [];
  const suggestedCommands = buildSuggestedCommands(mode, cycle, promptText);
  const notableFailures = failureSummary.trim()
    ? failureSummary.split(";").map((item) => item.trim()).filter(Boolean)
    : [];
  const verificationState = classifyVerificationState(mode, result);

  return {
    recordId: createRecordId(),
    mode,
    commands,
    result,
    verificationState,
    suggestedCommands,
    planSummary: buildPlanSummary(mode, suggestedCommands),
    notableFailures,
    followUpRequired: verificationState === "under_verified" || verificationState === "failed_verification" || verificationState === "verification_blocked",
    recordedAt: nowIso(),
  };
}

function parseRecordArgs(args: string | undefined): { result: VerificationResult | null; commandSummary: string; failureSummary: string } {
  const raw = args?.trim() ?? "";
  if (!raw) {
    return { result: null, commandSummary: "", failureSummary: "" };
  }

  const [resultToken, ...restTokens] = raw.split(/\s+/);
  const result = parseVerificationResult(resultToken);
  const rest = restTokens.join(" ").trim();
  const splitIndex = rest.indexOf("::");
  if (splitIndex === -1) {
    return { result, commandSummary: rest, failureSummary: "" };
  }

  return {
    result,
    commandSummary: rest.slice(0, splitIndex).trim(),
    failureSummary: rest.slice(splitIndex + 2).trim(),
  };
}

function parseRecoveryArgs(args: string | undefined): { recoveryId: string | null; note: string } {
  const raw = args?.trim() ?? "";
  if (!raw) return { recoveryId: null, note: "" };
  const [id, ...rest] = raw.split(/\s+/);
  return { recoveryId: id?.trim() || null, note: rest.join(" ").trim() };
}

function determineRecoveryReason(record: VerificationRecord): RecoveryReasonType {
  if (record.result === "failed") return "verification_failed";
  return "verification_missing";
}

function determineRecoverySeverity(record: VerificationRecord, relatedChangeId: string | null): RecoverySeverity {
  if (record.result === "failed") return "high";
  if (record.mode === "full" || relatedChangeId) return "medium";
  return "low";
}

function createRecoveryEntry(record: VerificationRecord, cycle: CycleState | null, note: string | null): RecoveryEntry | null {
  if (!record.followUpRequired) return null;
  return {
    recoveryId: createRecoveryId(),
    status: "open",
    severity: determineRecoverySeverity(record, cycle?.activeChangeId ?? null),
    reasonType: determineRecoveryReason(record),
    cycleId: cycle?.cycleId ?? null,
    relatedChangeId: cycle?.activeChangeId ?? null,
    verificationMode: record.mode,
    verificationResult: record.result,
    summary: note ?? "Verification recovery follow-up required.",
    recommendedNextAction: record.result === "failed"
      ? "Inspect the recorded failures, repair the slice, then rerun proportionate verification."
      : "Run the suggested verification before treating the slice as trusted.",
    suggestedCommands: record.suggestedCommands,
    createdAt: record.recordedAt,
    resolvedAt: null,
    resolutionNote: null,
  };
}

function createExecutionFailureRecovery(cycle: CycleState | null, summary: string): RecoveryEntry {
  return {
    recoveryId: createRecoveryId(),
    status: "open",
    severity: cycle?.activeChangeId ? "high" : "medium",
    reasonType: "execution_failed",
    cycleId: cycle?.cycleId ?? null,
    relatedChangeId: cycle?.activeChangeId ?? null,
    verificationMode: cycle?.verification?.mode ?? "none",
    verificationResult: cycle?.verification?.result ?? "not_run",
    summary,
    recommendedNextAction: "Inspect the failed cycle output and rerun one explicit cycle once the cause is understood.",
    suggestedCommands: [],
    createdAt: nowIso(),
    resolvedAt: null,
    resolutionNote: null,
  };
}

function matchesRecovery(entry: RecoveryEntry, cycle: CycleState | null): boolean {
  return entry.status === "open"
    && entry.cycleId === (cycle?.cycleId ?? null)
    && entry.relatedChangeId === (cycle?.activeChangeId ?? null);
}

function resolveMatchingRecovery(pi: ExtensionAPI, ctx: ExtensionContext, cycle: CycleState | null, note: string): void {
  for (const entry of restoreOpenRecoveryEntries(ctx)) {
    if (!matchesRecovery(entry, cycle)) continue;
    persistRecoveryEntry(pi, {
      ...entry,
      status: "resolved",
      resolvedAt: nowIso(),
      resolutionNote: note,
    });
  }
}

function persistRecoveryForRecord(pi: ExtensionAPI, ctx: ExtensionContext, record: VerificationRecord, cycle: CycleState | null, recoveryNote: string | null): RecoveryEntry | null {
  if (record.result === "passed") {
    resolveMatchingRecovery(pi, ctx, cycle, "Resolved by explicit passed verification record.");
    return null;
  }

  const recovery = createRecoveryEntry(record, cycle, recoveryNote);
  if (recovery) {
    persistRecoveryEntry(pi, recovery);
  }
  return recovery;
}

function formatStatus(mode: VerificationMode, source: VerificationModeEntry["source"], entry: VerificationEntry | null, recovery: RecoveryEntry | null): string {
  const lines = [`Current verification mode: ${mode} (${source})`];
  if (!entry) {
    lines.push("Latest verification: none");
  } else {
    lines.push(`Latest result: ${entry.record.result}`);
    lines.push(`State: ${entry.record.verificationState}`);
    lines.push(`Follow-up required: ${entry.record.followUpRequired}`);
    lines.push(`Commands: ${entry.record.commands.length > 0 ? entry.record.commands.join(" | ") : "none"}`);
    lines.push(`Suggested: ${entry.record.suggestedCommands.length > 0 ? entry.record.suggestedCommands.join(" | ") : "none"}`);
    lines.push(`Failures: ${entry.record.notableFailures.length > 0 ? entry.record.notableFailures.join("; ") : "none"}`);
    lines.push(`Related change: ${entry.relatedChangeId ?? "none"}`);
  }
  if (recovery?.status === "open") {
    lines.push(`Open recovery: ${recovery.recoveryId} (${recovery.reasonType}/${recovery.severity})`);
    lines.push(`Recovery action: ${recovery.recommendedNextAction}`);
  }
  return lines.join("\n");
}

function formatFollowup(entry: VerificationEntry | null, recovery: RecoveryEntry | null): string {
  if ((!entry || !entry.record.followUpRequired) && !recovery) {
    return "Verification follow-up: none";
  }

  return [
    `Verification follow-up for cycle: ${entry?.cycleId ?? recovery?.cycleId ?? "none"}`,
    `Mode: ${entry?.record.mode ?? recovery?.verificationMode ?? "none"}`,
    `Result: ${entry?.record.result ?? recovery?.verificationResult ?? "not_run"}`,
    `State: ${entry?.record.verificationState ?? "unknown"}`,
    `Related change: ${entry?.relatedChangeId ?? recovery?.relatedChangeId ?? "none"}`,
    `Suggested: ${entry?.record.suggestedCommands?.length ? entry.record.suggestedCommands.join(" | ") : "none"}`,
    `Failures: ${entry?.record.notableFailures.length ? entry.record.notableFailures.join("; ") : "none"}`,
    `Recovery: ${recovery?.summary ?? entry?.recoveryNote ?? "none"}`,
  ].join("\n");
}

function formatPlan(mode: VerificationMode, cycle: CycleState | null, promptText: string): string {
  const commands = buildSuggestedCommands(mode, cycle, promptText);
  return [
    `Mode: ${mode}`,
    `Plan: ${buildPlanSummary(mode, commands) ?? "none"}`,
    `Suggested commands: ${commands.length > 0 ? commands.join(" | ") : "none"}`,
  ].join("\n");
}

function formatRecoveryStatus(entries: RecoveryEntry[]): string {
  const open = entries.filter((entry) => entry.status === "open").reverse();
  if (open.length === 0) {
    return "Recovery debt: none";
  }

  return open.slice(0, 8).map((entry) => (
    `${entry.recoveryId} | ${entry.reasonType} | ${entry.severity} | change=${entry.relatedChangeId ?? "none"} | next=${entry.recommendedNextAction}`
  )).join("\n");
}

function formatHistory(entries: VerificationEntry[], count: number): string {
  const items = entries.slice(-count).reverse();
  if (items.length === 0) {
    return "Verification history: none";
  }

  return items
    .map((entry) => `${entry.record.recordId} | ${entry.record.mode} | ${entry.record.result} | state=${entry.record.verificationState}`)
    .join("\n");
}

function updateUi(mode: VerificationMode, entry: VerificationEntry | null, recovery: RecoveryEntry | null, ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  const result = entry?.record.result ?? "none";
  const recoveryLabel = recovery?.status === "open" ? `${recovery.reasonType}/${recovery.severity}` : "none";
  ctx.ui.setStatus(AIES_STATUS_KEYS.verification, ctx.ui.theme.fg("accent", `ver:${mode}/${result}`));
  ctx.ui.setWidget(AIES_WIDGET_KEYS.verification, [
    `mode=${mode}`,
    `result=${result}`,
    `state=${entry?.record.verificationState ?? "none"}`,
    `followup=${entry?.record.followUpRequired ?? false}`,
    `suggested=${entry?.record.suggestedCommands[0] ?? "none"}`,
  ]);
  ctx.ui.setStatus(AIES_STATUS_KEYS.recovery, ctx.ui.theme.fg(recovery?.status === "open" ? "warning" : "accent", `recovery:${recoveryLabel}`));
  ctx.ui.setWidget(AIES_WIDGET_KEYS.recovery, recovery
    ? [
        `id=${recovery.recoveryId}`,
        `status=${recovery.status}`,
        `reason=${recovery.reasonType}`,
        `severity=${recovery.severity}`,
        `next=${recovery.recommendedNextAction}`,
      ]
    : [
        "Recovery clear",
        "status=none",
        "reason=none",
      ]);
}

function buildPromptBlock(mode: VerificationMode, entry: VerificationEntry | null, recovery: RecoveryEntry | null, currentChangeId: string | null): string | null {
  const sameChange = currentChangeId && (entry?.relatedChangeId === currentChangeId || recovery?.relatedChangeId === currentChangeId);
  const needsPrompt = Boolean(recovery?.status === "open" && (sameChange || recovery.reasonType === "execution_failed"))
    || Boolean(entry && entry.record.result === "failed")
    || Boolean(entry && entry.record.result === "partial")
    || Boolean(entry && entry.record.result === "not_run" && sameChange && (mode === "fast" || mode === "full"));

  if (!needsPrompt) {
    return null;
  }

  return [
    "AIES VERIFICATION CONTEXT",
    `Current mode: ${mode}`,
    `Latest result: ${entry?.record.result ?? "none"}`,
    `Verification state: ${entry?.record.verificationState ?? "unknown"}`,
    `Recovery debt: ${recovery?.summary ?? entry?.recoveryNote ?? "none"}`,
    `Recommended next action: ${recovery?.recommendedNextAction ?? entry?.record.planSummary ?? "Keep verification proportionate to scope."}`,
    `Suggested commands: ${recovery?.suggestedCommands?.length ? recovery.suggestedCommands.join(" | ") : entry?.record.suggestedCommands?.join(" | ") || "none"}`,
    "Keep verification proportionate to scope. Address visible recovery debt when it materially affects trust, but do not force heavy checks for every slice.",
  ].join("\n");
}

export default function aiesVerificationExtension(pi: ExtensionAPI): void {
  let currentMode: VerificationMode = "none";
  let currentModeSource: VerificationModeEntry["source"] = "inferred";
  let latestEntry: VerificationEntry | null = null;
  let latestRecovery: RecoveryEntry | null = null;

  pi.registerCommand(AIES_COMMANDS.verificationStatus, {
    description: "Show the current AIES verification mode and latest record",
    handler: async (_args, ctx) => {
      latestEntry = restoreVerificationEntry(ctx);
      latestRecovery = restoreRecoveryEntry(ctx);
      const restoredMode = restoreVerificationModeEntry(ctx);
      if (restoredMode) {
        currentMode = restoredMode.mode;
        currentModeSource = restoredMode.source;
      }
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, formatStatus(currentMode, currentModeSource, latestEntry, latestRecovery));
    },
  });

  pi.registerCommand(AIES_COMMANDS.verificationPlan, {
    description: "Show the inferred verification plan for the current cycle",
    handler: async (_args, ctx) => {
      const heartbeat = restoreHeartbeat(ctx);
      const cycle = heartbeat?.currentCycle ?? null;
      const promptText = heartbeat?.lastPromptText ?? "";
      const openSpecEntry = restoreOpenSpecEntry(ctx);
      const modeEntry = restoreVerificationModeEntry(ctx);
      const mode = modeEntry?.source === "override"
        ? modeEntry.mode
        : inferVerificationMode(cycle, promptText, Boolean(openSpecEntry?.context.activeChangeId));
      writeLine(ctx, formatPlan(mode, cycle, promptText));
    },
  });

  pi.registerCommand(AIES_COMMANDS.verificationMode, {
    description: "Show or override the current AIES verification mode",
    handler: async (args, ctx) => {
      const requestedMode = parseVerificationMode(args);
      if (!args?.trim()) {
        latestEntry = restoreVerificationEntry(ctx);
        latestRecovery = restoreRecoveryEntry(ctx);
        updateUi(currentMode, latestEntry, latestRecovery, ctx);
        writeLine(ctx, formatStatus(currentMode, currentModeSource, latestEntry, latestRecovery));
        return;
      }
      if (!requestedMode) {
        writeLine(ctx, "Usage: /verification-mode [none|targeted|fast|full]", "error");
        return;
      }

      currentMode = requestedMode;
      currentModeSource = "override";
      persistModeEntry(pi, { mode: currentMode, source: currentModeSource, updatedAt: nowIso() });
      latestEntry = restoreVerificationEntry(ctx);
      latestRecovery = restoreRecoveryEntry(ctx);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, `AIES verification mode set to ${currentMode}.`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.verificationRecord, {
    description: "Record a verification result for the current cycle",
    handler: async (args, ctx) => {
      const heartbeat = restoreHeartbeat(ctx);
      const cycle = heartbeat?.currentCycle;
      if (!heartbeat || !cycle) {
        writeLine(ctx, "No active cycle is available for verification recording.", "error");
        return;
      }

      const parsed = parseRecordArgs(args);
      if (!parsed.result) {
        writeLine(ctx, "Usage: /verification-record <passed|failed|partial|not_run> [command summary] [:: failure summary]", "error");
        return;
      }

      const promptText = heartbeat.lastPromptText ?? "";
      const record = createVerificationRecord(currentMode, parsed.result, parsed.commandSummary, parsed.failureSummary, cycle, promptText);
      latestEntry = {
        record,
        cycleId: cycle.cycleId,
        relatedChangeId: cycle.activeChangeId,
        createdAt: record.recordedAt,
        recoveryNote: buildRecoveryNote(record, cycle.activeChangeId),
      };

      persistVerificationEntry(pi, latestEntry);
      latestRecovery = persistRecoveryForRecord(pi, ctx, record, cycle, latestEntry.recoveryNote) ?? restoreRecoveryEntry(ctx);
      persistModeEntry(pi, { mode: currentMode, source: currentModeSource, updatedAt: nowIso() });
      updateHeartbeatVerification(pi, heartbeat, record);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, `Verification recorded: ${record.mode}/${record.result}`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.verificationFollowup, {
    description: "Show outstanding AIES verification follow-up state",
    handler: async (_args, ctx) => {
      latestEntry = restoreVerificationEntry(ctx);
      latestRecovery = restoreRecoveryEntry(ctx);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, formatFollowup(latestEntry, latestRecovery));
    },
  });

  pi.registerCommand(AIES_COMMANDS.recoveryStatus, {
    description: "Show open AIES recovery debt",
    handler: async (_args, ctx) => {
      const entries = restoreRecoveryHistory(ctx);
      latestRecovery = restoreRecoveryEntry(ctx);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, formatRecoveryStatus(entries));
    },
  });

  pi.registerCommand(AIES_COMMANDS.recoveryResolve, {
    description: "Resolve an open recovery item",
    handler: async (args, ctx) => {
      const { recoveryId, note } = parseRecoveryArgs(args);
      if (!recoveryId) {
        writeLine(ctx, "Usage: /recovery-resolve <recoveryId> [note]", "error");
        return;
      }
      const entry = restoreRecoveryHistory(ctx).reverse().find((item) => item.recoveryId === recoveryId && item.status === "open");
      if (!entry) {
        writeLine(ctx, `Recovery item not found: ${recoveryId}`, "error");
        return;
      }
      latestRecovery = {
        ...entry,
        status: "resolved",
        resolvedAt: nowIso(),
        resolutionNote: note || "Resolved manually.",
      };
      persistRecoveryEntry(pi, latestRecovery);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, `Resolved recovery item ${recoveryId}.`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.recoveryDefer, {
    description: "Defer an open recovery item",
    handler: async (args, ctx) => {
      const { recoveryId, note } = parseRecoveryArgs(args);
      if (!recoveryId) {
        writeLine(ctx, "Usage: /recovery-defer <recoveryId> [note]", "error");
        return;
      }
      const entry = restoreRecoveryHistory(ctx).reverse().find((item) => item.recoveryId === recoveryId && item.status === "open");
      if (!entry) {
        writeLine(ctx, `Recovery item not found: ${recoveryId}`, "error");
        return;
      }
      latestRecovery = {
        ...entry,
        status: "deferred",
        resolvedAt: nowIso(),
        resolutionNote: note || "Deferred manually.",
      };
      persistRecoveryEntry(pi, latestRecovery);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      writeLine(ctx, `Deferred recovery item ${recoveryId}.`, "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    latestEntry = restoreVerificationEntry(ctx);
    latestRecovery = restoreRecoveryEntry(ctx);
    const restoredMode = restoreVerificationModeEntry(ctx);
    if (restoredMode) {
      currentMode = restoredMode.mode;
      currentModeSource = restoredMode.source;
    }
    updateUi(currentMode, latestEntry, latestRecovery, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    latestEntry = restoreVerificationEntry(ctx);
    latestRecovery = restoreRecoveryEntry(ctx);
    const restoredMode = restoreVerificationModeEntry(ctx);
    if (restoredMode) {
      currentMode = restoredMode.mode;
      currentModeSource = restoredMode.source;
    }
    updateUi(currentMode, latestEntry, latestRecovery, ctx);
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    const heartbeat = restoreHeartbeat(ctx);
    const cycle = heartbeat?.currentCycle ?? null;
    const modeEntry = restoreVerificationModeEntry(ctx);
    const openSpecEntry = restoreOpenSpecEntry(ctx);

    if (modeEntry?.source === "override") {
      currentMode = modeEntry.mode;
      currentModeSource = "override";
    } else {
      currentMode = inferVerificationMode(cycle, event.prompt ?? heartbeat?.lastPromptText ?? "", Boolean(openSpecEntry?.context.activeChangeId));
      currentModeSource = "inferred";
      persistModeEntry(pi, { mode: currentMode, source: currentModeSource, updatedAt: nowIso() });
    }

    latestEntry = restoreVerificationEntry(ctx);
    latestRecovery = restoreRecoveryEntry(ctx);
    updateUi(currentMode, latestEntry, latestRecovery, ctx);
    const promptBlock = buildPromptBlock(currentMode, latestEntry, latestRecovery, cycle?.activeChangeId ?? openSpecEntry?.context.activeChangeId ?? null);
    if (!promptBlock) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${promptBlock}`,
    };
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    const heartbeat = restoreHeartbeat(ctx);
    const cycle = heartbeat?.currentCycle;
    if (!heartbeat || !cycle) {
      return;
    }

    const promptText = getLatestUserText(event.messages) || heartbeat.lastPromptText || "";
    if (isCommandPrompt(promptText)) {
      latestEntry = restoreVerificationEntry(ctx);
      latestRecovery = restoreRecoveryEntry(ctx);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      return;
    }

    const latest = restoreVerificationEntry(ctx);
    if (latest?.cycleId === cycle.cycleId) {
      latestEntry = latest;
      latestRecovery = restoreRecoveryEntry(ctx);
      updateUi(currentMode, latestEntry, latestRecovery, ctx);
      return;
    }

    const assistantText = getMessageText([...event.messages].reverse().find((message) => message.role === "assistant"));
    const record = createVerificationRecord(currentMode, "not_run", "", assistantText ? "" : "Assistant output was unavailable at cycle end.", cycle, promptText);
    latestEntry = {
      record,
      cycleId: cycle.cycleId,
      relatedChangeId: cycle.activeChangeId,
      createdAt: record.recordedAt,
      recoveryNote: buildRecoveryNote(record, cycle.activeChangeId),
    };

    persistVerificationEntry(pi, latestEntry);
    latestRecovery = persistRecoveryForRecord(pi, ctx, record, cycle, latestEntry.recoveryNote) ?? restoreRecoveryEntry(ctx);
    updateHeartbeatVerification(pi, heartbeat, record);
    updateUi(currentMode, latestEntry, latestRecovery, ctx);
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    const heartbeat = restoreHeartbeat(ctx);
    const cycle = heartbeat?.currentCycle;
    if (!cycle) return;
    const promptText = getLatestUserText(event.messages) || heartbeat?.lastPromptText || "";
    if (isCommandPrompt(promptText)) {
      return;
    }
    const assistantText = getMessageText([...event.messages].reverse().find((message) => message.role === "assistant"));
    if (assistantText) return;

    const recovery = createExecutionFailureRecovery(cycle, "Cycle ended without assistant output; inspect the run before retrying.");
    persistRecoveryEntry(pi, recovery);
    latestRecovery = recovery;
    updateUi(currentMode, latestEntry, latestRecovery, ctx);
  });
}
