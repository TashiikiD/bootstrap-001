import { basename, resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  readAuditGuidanceEffectivenessReportByRelativePath,
  readAuditGuidanceOutcomeReportByRelativePath,
} from "./audit-radar-guidance-reports";
import { projectRoot, type ParsedSession } from "./lib";

export interface CycleRunAuditHistoryItem {
  runId: string;
  sessionPath: string;
  sessionLabel: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: string;
  triggerSource: string;
  promptSummary: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  auditStatus: string;
  auditVerification: string;
  loopId: string | null;
  loopReportPath: string | null;
  hasDurableLoopReport: boolean;
  auditSummary: string;
  auditFailure: string | null;
  guidanceOutcomeStatus: string;
  guidanceOutcomeSummary: string;
  guidanceOutcomeReportPath: string | null;
  hasDurableGuidanceOutcomeReport: boolean;
  guidanceEffectivenessVerdict: string | null;
  guidanceEffectivenessSummary: string;
  guidanceEffectivenessReportPath: string | null;
  hasDurableGuidanceEffectivenessReport: boolean;
}

function cycleAuditVerificationLabel(audit: Record<string, unknown> | null | undefined): string {
  const mode = typeof audit?.verificationMode === "string" ? audit.verificationMode : null;
  const result = typeof audit?.verificationResult === "string" ? audit.verificationResult : null;
  return mode && result ? `${mode}/${result}` : "none";
}

function reportExists(relativePath: string | null | undefined): boolean {
  const normalized = String(relativePath ?? "").trim();
  if (!normalized) {
    return false;
  }

  return existsSync(resolve(projectRoot, normalized));
}

export function readCycleRunAuditHistory(sessions: ParsedSession[], limit = 12): CycleRunAuditHistoryItem[] {
  const items = sessions.flatMap((session) => session.entries
    .filter((entry) => entry.type === "custom" && entry.customType === "aies-cycle-run")
    .map((entry) => {
      const data = entry.data ?? {};
      const audit = data.postRunAudit ?? null;
      const loopReportPath = typeof audit?.loopReportPath === "string" ? audit.loopReportPath : null;
      const guidanceOutcomeReportPath = typeof data.guidanceOutcomeReportPath === "string" ? data.guidanceOutcomeReportPath : null;
      const guidanceEffectivenessReportPath = typeof data.guidanceEffectivenessReportPath === "string"
        ? data.guidanceEffectivenessReportPath
        : null;
      const guidanceOutcomeRecord = readAuditGuidanceOutcomeReportByRelativePath(guidanceOutcomeReportPath);
      const guidanceEffectivenessRecord = readAuditGuidanceEffectivenessReportByRelativePath(guidanceEffectivenessReportPath);
      const matchingGuidanceEffectivenessItem = guidanceEffectivenessRecord?.report.items.find((item) =>
        guidanceOutcomeRecord ? item.guidanceOutcomeReportId === guidanceOutcomeRecord.report.reportId : true)
        ?? guidanceEffectivenessRecord?.report.items[0]
        ?? null;
      const fallbackGuidanceEffectivenessVerdict = typeof data.guidanceEffectivenessVerdict === "string"
        ? data.guidanceEffectivenessVerdict
        : null;
      const fallbackGuidanceEffectivenessSummary = typeof data.guidanceEffectivenessSummary === "string"
        ? data.guidanceEffectivenessSummary
        : null;

      return {
        runId: String(data.runId ?? entry.id ?? basename(session.path)),
        sessionPath: session.path,
        sessionLabel: basename(session.path),
        startedAt: typeof data.startedAt === "string" ? data.startedAt : null,
        finishedAt: typeof data.finishedAt === "string" ? data.finishedAt : null,
        status: String(data.status ?? "unknown"),
        triggerSource: String(data.triggerSource ?? "unknown"),
        promptSummary: String(data.promptSummary ?? "No prompt summary recorded."),
        relatedCycleId: typeof data.relatedCycleId === "string" ? data.relatedCycleId : null,
        relatedChangeId: typeof data.relatedChangeId === "string" ? data.relatedChangeId : null,
        auditStatus: typeof audit?.status === "string" ? audit.status : "none",
        auditVerification: cycleAuditVerificationLabel(audit),
        loopId: typeof audit?.loopId === "string" ? audit.loopId : null,
        loopReportPath,
        hasDurableLoopReport: reportExists(loopReportPath),
        auditSummary: typeof audit?.summary === "string" ? audit.summary : "No post-run audit recorded.",
        auditFailure: typeof audit?.failureNote === "string" ? audit.failureNote : null,
        guidanceOutcomeStatus: guidanceOutcomeReportPath
          ? guidanceOutcomeRecord?.report.alignment.status ?? "missing_report"
          : "none",
        guidanceOutcomeSummary: guidanceOutcomeRecord?.report.alignment.summary
          ?? (guidanceOutcomeReportPath
            ? `Guidance-outcome report path was recorded but could not be loaded: ${guidanceOutcomeReportPath}`
            : "No guidance-outcome report recorded."),
        guidanceOutcomeReportPath,
        hasDurableGuidanceOutcomeReport: Boolean(guidanceOutcomeRecord),
        guidanceEffectivenessVerdict: matchingGuidanceEffectivenessItem?.verdict ?? fallbackGuidanceEffectivenessVerdict,
        guidanceEffectivenessSummary: matchingGuidanceEffectivenessItem?.summary
          ?? fallbackGuidanceEffectivenessSummary
          ?? (guidanceEffectivenessReportPath
            ? `Guidance-effectiveness report path was recorded but could not be loaded: ${guidanceEffectivenessReportPath}`
            : "No guidance-effectiveness report recorded."),
        guidanceEffectivenessReportPath,
        hasDurableGuidanceEffectivenessReport: Boolean(guidanceEffectivenessRecord),
      } satisfies CycleRunAuditHistoryItem;
    }))
    .filter((item) => item.auditStatus !== "none");

  return items
    .sort((left, right) => String(right.finishedAt ?? right.startedAt ?? "").localeCompare(String(left.finishedAt ?? left.startedAt ?? "")))
    .slice(0, limit);
}
