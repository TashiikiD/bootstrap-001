import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { VerificationResult, VerificationState } from "../../contracts/primitives.ts";
import { executeAuditRadarLoop } from "../evaluation/audit-radar-loop.ts";
import type { CycleRunAuditTrail } from "./state.ts";

function summarizeVerification(
  mode: string | null,
  result: VerificationResult | null,
  verificationState: VerificationState | null,
): string {
  if (!mode || !result) {
    return "No post-run audit verification was recorded.";
  }

  return verificationState
    ? `Post-run audit verification recorded ${mode}/${result} (${verificationState}).`
    : `Post-run audit verification recorded ${mode}/${result}.`;
}

export function createSkippedPostRunAudit(summary: string, failureNote: string | null = null): CycleRunAuditTrail {
  return {
    status: "skipped",
    loopId: null,
    loopReportPath: null,
    snapshotId: null,
    outcomeReportId: null,
    verificationMode: null,
    verificationResult: null,
    verificationState: null,
    recoveryId: null,
    summary,
    failureNote,
  };
}

export function runPostCycleAudit(pi: ExtensionAPI, ctx: ExtensionContext): CycleRunAuditTrail {
  try {
    const result = executeAuditRadarLoop(pi, ctx, { orchestrationSource: "cycle_runner" });
    return {
      status: "completed",
      loopId: result.loopReport.loopId,
      loopReportPath: result.loopReportPath,
      snapshotId: result.snapshot.snapshotId,
      outcomeReportId: result.outcomeReport?.reportId ?? null,
      verificationMode: result.verificationEntry.record.mode,
      verificationResult: result.verificationEntry.record.result,
      verificationState: result.verificationEntry.record.verificationState,
      recoveryId: result.recoveryEntry?.recoveryId ?? null,
      summary: result.loopReport.summary,
      failureNote: null,
    };
  } catch (error) {
    const failureNote = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      loopId: null,
      loopReportPath: null,
      snapshotId: null,
      outcomeReportId: null,
      verificationMode: null,
      verificationResult: null,
      verificationState: null,
      recoveryId: null,
      summary: "Post-run audit failed before it could persist a durable loop report.",
      failureNote,
    };
  }
}
