import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CycleState } from "../../contracts/cycle-state.ts";
import type { VerificationRecord } from "../../contracts/verification-record.ts";
import type { IsoTimestamp, VerificationMode, VerificationResult, VerificationState } from "../../contracts/primitives.ts";
import type { LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  RECOVERY_ENTRY_TYPE,
  VERIFICATION_ENTRY_TYPE,
  restoreOpenRecoveryEntries,
  restoreVerificationModeEntry,
  type RecoveryEntry,
  type VerificationEntry,
} from "../verification/state.ts";
import { createLayerAuditSnapshot } from "./audit-radar-assessment.ts";
import type { AuditOutcomeReport } from "./audit-radar-outcomes.ts";
import { createAuditOutcomeReport, persistAuditOutcomeReport } from "./audit-radar-outcomes.ts";
import { scanAuditEvidence } from "./audit-radar-scanner.ts";
import { loadAuditSnapshotHistory, persistAuditSnapshot } from "./audit-radar-state.ts";

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  lastCycle: CycleState | null;
  completedCycles: number;
  lastPromptText: string | null;
  lastAssistantText: string | null;
  lastCompletedAt: string | null;
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const QUICK_VERIFY_TIMEOUT_MS = 20 * 60 * 1000;
const QUICK_VERIFY_COMMAND = "./verify-aies-quick.ps1";

export interface AuditLoopQuickVerification {
  requestedMode: VerificationMode;
  executedCommand: string;
  exitCode: number | null;
  durationMs: number;
  result: VerificationResult;
  verificationState: VerificationState;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  notableFailures: string[];
  followUpRequired: boolean;
}

export type AuditLoopOrchestrationSource = "manual_command" | "cycle_runner";

export interface AuditLoopReport {
  loopId: string;
  generatedAt: IsoTimestamp;
  orchestrationSource: AuditLoopOrchestrationSource;
  sessionPath: string | null;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  snapshotId: string;
  snapshotPath: string;
  outcomeReportId: string | null;
  outcomeReportPath: string | null;
  verificationRecordId: string;
  verification: AuditLoopQuickVerification;
  recoveryId: string | null;
  summary: string;
}

export interface AuditLoopRunResult {
  snapshot: LayerAuditSnapshot;
  snapshotPath: string;
  outcomeReport: AuditOutcomeReport | null;
  outcomeReportPath: string | null;
  verificationEntry: VerificationEntry;
  recoveryEntry: RecoveryEntry | null;
  loopReport: AuditLoopReport;
  loopReportPath: string;
}

export interface ExecuteAuditRadarLoopOptions {
  orchestrationSource?: AuditLoopOrchestrationSource;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createLoopId(generatedAt: string): string {
  return `audit-loop-${generatedAt.replace(/[:.]/g, "-")}`;
}

function createVerificationRecordId(recordedAt: string): string {
  return `ver-${recordedAt.replace(/[:.]/g, "-")}`;
}

function createRecoveryId(createdAt: string): string {
  return `recovery-${createdAt.replace(/[:.]/g, "-")}`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function ensureAuditLoopDirectory(): string {
  const directory = getAiesPaths().auditRadarLoopsRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

function normalizeLoopReportFileName(report: AuditLoopReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.loopId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function truncate(text: string | null | undefined, maxLength = 700): string | null {
  if (!text) {
    return null;
  }

  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) {
    return null;
  }

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function restoreHeartbeat(ctx: ExtensionContext): HeartbeatEntry | null {
  const entry = ctx.sessionManager.getEntries()
    .filter((item: { type: string; customType?: string }) => item.type === "custom" && item.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  return entry?.data ?? null;
}

function resolveHeartbeatCycle(ctx: ExtensionContext): CycleState | null {
  const heartbeat = restoreHeartbeat(ctx);
  return heartbeat?.currentCycle ?? heartbeat?.lastCycle ?? null;
}

function requestedVerificationMode(ctx: ExtensionContext): VerificationMode {
  return restoreVerificationModeEntry(ctx)?.mode ?? "fast";
}

function powershellExecutable(): string {
  const preferred = resolve(process.env.WINDIR ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return existsSync(preferred) ? preferred : "powershell";
}

function quickVerifyScriptPath(): string {
  return resolve(getAiesPaths().projectRoot, "verify-aies-quick.ps1");
}

function determineVerificationOutcome(requestedMode: VerificationMode, exitCode: number | null): {
  result: VerificationResult;
  verificationState: VerificationState;
  followUpRequired: boolean;
} {
  if (exitCode === 0) {
    if (requestedMode === "full") {
      return {
        result: "partial",
        verificationState: "under_verified",
        followUpRequired: true,
      };
    }

    return {
      result: "passed",
      verificationState: "verified",
      followUpRequired: false,
    };
  }

  return {
    result: "failed",
    verificationState: "failed_verification",
    followUpRequired: true,
  };
}

function runQuickVerification(requestedMode: VerificationMode): AuditLoopQuickVerification {
  const startedAt = Date.now();
  const launched = spawnSync(
    powershellExecutable(),
    ["-ExecutionPolicy", "Bypass", "-File", quickVerifyScriptPath()],
    {
      cwd: getAiesPaths().projectRoot,
      encoding: "utf8",
      timeout: QUICK_VERIFY_TIMEOUT_MS,
      windowsHide: true,
    },
  );

  const durationMs = Date.now() - startedAt;
  const stdoutText = truncate(typeof launched.stdout === "string" ? launched.stdout : null);
  const stderrText = truncate(typeof launched.stderr === "string" ? launched.stderr : null);
  const executionFailure = launched.error ? truncate(launched.error.message) : null;
  const exitCode = typeof launched.status === "number" ? launched.status : null;
  const outcome = determineVerificationOutcome(requestedMode, exitCode);
  const notableFailures = [executionFailure, stderrText, outcome.result === "partial"
    ? "Quick verification passed, but current verification mode is full so the session remains under-verified until broader checks run."
    : null]
    .filter((item): item is string => Boolean(item));

  return {
    requestedMode,
    executedCommand: QUICK_VERIFY_COMMAND,
    exitCode,
    durationMs,
    result: outcome.result,
    verificationState: outcome.verificationState,
    stdoutExcerpt: stdoutText,
    stderrExcerpt: stderrText,
    notableFailures,
    followUpRequired: outcome.followUpRequired,
  };
}

function createVerificationEntry(verification: AuditLoopQuickVerification, cycle: CycleState | null): VerificationEntry {
  const recordedAt = nowIso();
  const record: VerificationRecord = {
    recordId: createVerificationRecordId(recordedAt),
    mode: verification.requestedMode,
    commands: [verification.executedCommand],
    result: verification.result,
    verificationState: verification.verificationState,
    suggestedCommands: verification.followUpRequired
      ? verification.requestedMode === "full"
        ? [QUICK_VERIFY_COMMAND, "Run the broader full verification suite expected by the current verification mode."]
        : [QUICK_VERIFY_COMMAND]
      : [QUICK_VERIFY_COMMAND],
    planSummary: verification.result === "partial"
      ? "Quick verification completed, but the current full verification mode still expects broader checks."
      : verification.result === "passed"
        ? "Quick verification completed successfully inside /audit-radar-loop."
        : "Quick verification failed inside /audit-radar-loop.",
    notableFailures: verification.notableFailures,
    followUpRequired: verification.followUpRequired,
    recordedAt,
  };

  return {
    record,
    cycleId: cycle?.cycleId ?? null,
    relatedChangeId: cycle?.activeChangeId ?? null,
    createdAt: recordedAt,
    recoveryNote: verification.followUpRequired
      ? verification.result === "failed"
        ? "Audit loop quick verification failed; repair the slice and rerun proportionate checks."
        : "Audit loop quick verification passed, but the session remains under-verified for full mode."
      : null,
  };
}

function sameRecoveryTarget(entry: RecoveryEntry, cycle: CycleState | null): boolean {
  return entry.status === "open"
    && entry.cycleId === (cycle?.cycleId ?? null)
    && entry.relatedChangeId === (cycle?.activeChangeId ?? null);
}

function resolveMatchingRecoveryEntries(pi: ExtensionAPI, ctx: ExtensionContext, cycle: CycleState | null, note: string): void {
  for (const entry of restoreOpenRecoveryEntries(ctx)) {
    if (!sameRecoveryTarget(entry, cycle)) {
      continue;
    }

    pi.appendEntry(RECOVERY_ENTRY_TYPE, {
      ...entry,
      status: "resolved",
      resolvedAt: nowIso(),
      resolutionNote: note,
    } satisfies RecoveryEntry);
  }
}

function createRecoveryEntry(verificationEntry: VerificationEntry, cycle: CycleState | null): RecoveryEntry | null {
  const { record } = verificationEntry;
  if (!record.followUpRequired) {
    return null;
  }

  return {
    recoveryId: createRecoveryId(record.recordedAt),
    status: "open",
    severity: record.result === "failed" ? "high" : cycle?.activeChangeId ? "medium" : "low",
    reasonType: record.result === "failed" ? "verification_failed" : "verification_missing",
    cycleId: cycle?.cycleId ?? null,
    relatedChangeId: cycle?.activeChangeId ?? null,
    verificationMode: record.mode,
    verificationResult: record.result,
    summary: verificationEntry.recoveryNote ?? "Audit loop verification follow-up required.",
    recommendedNextAction: record.result === "failed"
      ? "Inspect the quick verification failure, repair the slice, then rerun /audit-radar-loop or ./verify-aies-quick.ps1."
      : "Run the broader verification expected by full mode, or explicitly relax the session verification mode if quick verification is sufficient.",
    suggestedCommands: record.suggestedCommands,
    createdAt: record.recordedAt,
    resolvedAt: null,
    resolutionNote: null,
  };
}

function summarizeLoop(
  snapshot: LayerAuditSnapshot,
  outcomeReport: AuditOutcomeReport | null,
  verificationEntry: VerificationEntry,
  recoveryEntry: RecoveryEntry | null,
): string {
  return [
    `Audit snapshot ${snapshot.snapshotId} recorded binding constraint ${snapshot.bindingConstraint.dimension}.`,
    outcomeReport
      ? `Outcome report ${outcomeReport.reportId} compared ${outcomeReport.comparisons.length} interval${outcomeReport.comparisons.length === 1 ? "" : "s"}.`
      : "Outcome comparison was skipped because fewer than two snapshots were available.",
    `Quick verification recorded ${verificationEntry.record.mode}/${verificationEntry.record.result}.`,
    recoveryEntry
      ? `Recovery opened: ${recoveryEntry.reasonType}/${recoveryEntry.severity}.`
      : "No recovery entry was needed.",
  ].join(" ");
}

function createLoopReport(
  ctx: ExtensionContext,
  snapshot: LayerAuditSnapshot,
  snapshotPath: string,
  outcomeReport: AuditOutcomeReport | null,
  outcomeReportPath: string | null,
  verificationEntry: VerificationEntry,
  recoveryEntry: RecoveryEntry | null,
  verification: AuditLoopQuickVerification,
  orchestrationSource: AuditLoopOrchestrationSource,
): AuditLoopReport {
  const generatedAt = nowIso();

  return {
    loopId: createLoopId(generatedAt),
    generatedAt,
    orchestrationSource,
    sessionPath: ctx.sessionManager.getSessionFile() ?? null,
    relatedCycleId: verificationEntry.cycleId,
    relatedChangeId: verificationEntry.relatedChangeId,
    snapshotId: snapshot.snapshotId,
    snapshotPath,
    outcomeReportId: outcomeReport?.reportId ?? null,
    outcomeReportPath,
    verificationRecordId: verificationEntry.record.recordId,
    verification,
    recoveryId: recoveryEntry?.recoveryId ?? null,
    summary: summarizeLoop(snapshot, outcomeReport, verificationEntry, recoveryEntry),
  };
}

function isAuditLoopReport(value: unknown): value is AuditLoopReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditLoopReport>;
  return typeof candidate.loopId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.snapshotId === "string"
    && typeof candidate.snapshotPath === "string"
    && typeof candidate.verificationRecordId === "string"
    && typeof candidate.summary === "string";
}

export function loadAuditLoopHistory(limit = 10): AuditLoopReport[] {
  const directory = ensureAuditLoopDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditLoopReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditLoopReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditLoopReport(): AuditLoopReport | null {
  return loadAuditLoopHistory(1)[0] ?? null;
}

export function persistAuditLoopReport(report: AuditLoopReport): string {
  const fullPath = join(ensureAuditLoopDirectory(), normalizeLoopReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function executeAuditRadarLoop(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  options: ExecuteAuditRadarLoopOptions = {},
): AuditLoopRunResult {
  const orchestrationSource = options.orchestrationSource ?? "manual_command";
  const cycle = resolveHeartbeatCycle(ctx);
  const history = loadAuditSnapshotHistory(0);
  const snapshot = createLayerAuditSnapshot(scanAuditEvidence(), history);
  const snapshotPath = persistAuditSnapshot(snapshot);

  const historyWithCurrent = [...history, snapshot];
  const outcomeReport = createAuditOutcomeReport(historyWithCurrent);
  const outcomeReportPath = outcomeReport ? persistAuditOutcomeReport(outcomeReport) : null;

  const verification = runQuickVerification(requestedVerificationMode(ctx));
  const verificationEntry = createVerificationEntry(verification, cycle);
  pi.appendEntry(VERIFICATION_ENTRY_TYPE, verificationEntry);

  let recoveryEntry: RecoveryEntry | null = null;
  if (verificationEntry.record.followUpRequired) {
    recoveryEntry = createRecoveryEntry(verificationEntry, cycle);
    if (recoveryEntry) {
      pi.appendEntry(RECOVERY_ENTRY_TYPE, recoveryEntry);
    }
  } else {
    resolveMatchingRecoveryEntries(pi, ctx, cycle, "Resolved by successful /audit-radar-loop quick verification.");
  }

  const loopReport = createLoopReport(
    ctx,
    snapshot,
    snapshotPath,
    outcomeReport,
    outcomeReportPath,
    verificationEntry,
    recoveryEntry,
    verification,
    orchestrationSource,
  );
  const loopReportPath = persistAuditLoopReport(loopReport);

  return {
    snapshot,
    snapshotPath,
    outcomeReport,
    outcomeReportPath,
    verificationEntry,
    recoveryEntry,
    loopReport,
    loopReportPath,
  };
}

export function formatAuditLoopRun(result: AuditLoopRunResult): string {
  const verification = result.loopReport.verification;
  const lines = [
    `AIES audit radar loop @ ${result.loopReport.generatedAt}`,
    `Loop: ${result.loopReport.loopId}`,
    `Orchestration source: ${result.loopReport.orchestrationSource}`,
    `Snapshot: ${result.snapshot.snapshotId} (${result.snapshot.bindingConstraint.dimension})`,
    `Snapshot path: ${result.snapshotPath}`,
    `Outcome report: ${result.outcomeReport ? `${result.outcomeReport.reportId} (${result.outcomeReportPath})` : "skipped"}`,
    `Verification: ${result.verificationEntry.record.mode}/${result.verificationEntry.record.result}`,
    `Verification state: ${result.verificationEntry.record.verificationState}`,
    `Verification command: ${verification.executedCommand}`,
    `Verification exit: ${verification.exitCode ?? "none"}`,
    `Verification duration ms: ${verification.durationMs}`,
    `Recovery: ${result.recoveryEntry ? `${result.recoveryEntry.recoveryId} (${result.recoveryEntry.reasonType}/${result.recoveryEntry.severity})` : "none"}`,
    `Summary: ${result.loopReport.summary}`,
    `Verification stdout: ${verification.stdoutExcerpt ?? "none"}`,
    `Verification stderr: ${verification.stderrExcerpt ?? "none"}`,
    `Persisted loop report: ${result.loopReportPath}`,
  ];

  return lines.join("\n");
}
