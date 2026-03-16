import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AiesAuditRecommendedActionType } from "../../contracts/layer-audit-snapshot.ts";
import type { AiesDimension, FocusType, IsoTimestamp, VerificationMode, VerificationResult, VerificationState } from "../../contracts/primitives.ts";
import type { VerificationScopeBaseline, VerificationScopeReport } from "../verification/change-scope.ts";

export type CycleRunStatus = "idle" | "requested" | "running" | "completed" | "blocked" | "aborted" | "failed";
export type CycleRunTriggerSource = "slash_command" | "operator_ui" | "heartbeat_tui";
export type CycleRunAuditStatus = "completed" | "failed" | "skipped";

export interface CycleRunAuditTrail {
  status: CycleRunAuditStatus;
  loopId: string | null;
  loopReportPath: string | null;
  snapshotId: string | null;
  outcomeReportId: string | null;
  verificationMode: VerificationMode | null;
  verificationResult: VerificationResult | null;
  verificationState: VerificationState | null;
  recoveryId: string | null;
  summary: string;
  failureNote: string | null;
}

export interface CycleRunGuidanceTrail {
  snapshotId: string;
  observedAt: IsoTimestamp;
  activeChangeId: string | null;
  continueActiveChange: boolean;
  recommendedFocusType: FocusType;
  actionType: AiesAuditRecommendedActionType;
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  suggestedPaths: string[];
  summary: string;
  rationale: string;
  driftSummary: string;
  latestLoopGeneratedAt: IsoTimestamp | null;
  latestLoopSource: string | null;
  latestLoopVerification: string;
  latestLoopReportPath: string | null;
  learningPosture: string | null;
  learningSummary: string;
  learningRecommendation: string;
  learningRelevantItemCount: number;
  learningReportGeneratedAt: IsoTimestamp | null;
  learningReportPath: string | null;
  experimentType: string | null;
  experimentNextPosture: string | null;
  experimentSummary: string;
  experimentPlannedRelevantCycles: number;
  experimentReportGeneratedAt: IsoTimestamp | null;
  experimentReportPath: string | null;
}

export interface CycleRunEntry {
  runId: string;
  status: CycleRunStatus;
  triggerSource: CycleRunTriggerSource;
  sessionId: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  promptSummary: string;
  promptText: string;
  startedAt: string;
  finishedAt: string | null;
  failureNote: string | null;
  auditGuidance: CycleRunGuidanceTrail | null;
  verificationScopeBaseline: VerificationScopeBaseline | null;
  verificationScope: VerificationScopeReport | null;
  guidanceOutcomeReportPath: string | null;
  guidanceEffectivenessReportPath: string | null;
  guidanceEffectivenessVerdict: string | null;
  guidanceEffectivenessSummary: string | null;
  guidanceLearningReviewReportPath: string | null;
  guidanceLearningReviewSummary: string | null;
  guidanceExperimentReviewReportPath: string | null;
  guidanceExperimentReviewStatus: string | null;
  guidanceExperimentReviewSummary: string | null;
  guidanceExperimentReportPath: string | null;
  guidanceExperimentSummary: string | null;
  postRunAudit: CycleRunAuditTrail | null;
}

export interface CycleThoughtBlock {
  index: number;
  label: string;
  text: string;
}

export interface CycleThoughtEntry {
  runId: string;
  sessionId: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  startedAt: string;
  finishedAt: string | null;
  blocks: CycleThoughtBlock[];
}

export const CYCLE_RUN_ENTRY_TYPE = "aies-cycle-run";
export const CYCLE_THOUGHT_ENTRY_TYPE = "aies-cycle-thoughts";

function normalizeCycleRunEntry(entry: Partial<CycleRunEntry> | undefined): CycleRunEntry | null {
  if (!entry?.runId || !entry.status || !entry.triggerSource || !entry.sessionId || !entry.startedAt) {
    return null;
  }

  return {
    runId: entry.runId,
    status: entry.status,
    triggerSource: entry.triggerSource,
    sessionId: entry.sessionId,
    relatedCycleId: entry.relatedCycleId ?? null,
    relatedChangeId: entry.relatedChangeId ?? null,
    promptSummary: entry.promptSummary ?? "No prompt summary recorded.",
    promptText: entry.promptText ?? entry.promptSummary ?? "No synthesized prompt recorded.",
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt ?? null,
    failureNote: entry.failureNote ?? null,
    auditGuidance: entry.auditGuidance ?? null,
    verificationScopeBaseline: entry.verificationScopeBaseline ?? null,
    verificationScope: entry.verificationScope ?? null,
    guidanceOutcomeReportPath: entry.guidanceOutcomeReportPath ?? null,
    guidanceEffectivenessReportPath: entry.guidanceEffectivenessReportPath ?? null,
    guidanceEffectivenessVerdict: entry.guidanceEffectivenessVerdict ?? null,
    guidanceEffectivenessSummary: entry.guidanceEffectivenessSummary ?? null,
    guidanceLearningReviewReportPath: entry.guidanceLearningReviewReportPath ?? null,
    guidanceLearningReviewSummary: entry.guidanceLearningReviewSummary ?? null,
    guidanceExperimentReviewReportPath: entry.guidanceExperimentReviewReportPath ?? null,
    guidanceExperimentReviewStatus: entry.guidanceExperimentReviewStatus ?? null,
    guidanceExperimentReviewSummary: entry.guidanceExperimentReviewSummary ?? null,
    guidanceExperimentReportPath: entry.guidanceExperimentReportPath ?? null,
    guidanceExperimentSummary: entry.guidanceExperimentSummary ?? null,
    postRunAudit: entry.postRunAudit ?? null,
  };
}

export function restoreCycleRunEntry(ctx: ExtensionContext): CycleRunEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const runEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === CYCLE_RUN_ENTRY_TYPE)
    .pop() as { data?: Partial<CycleRunEntry> } | undefined;

  return normalizeCycleRunEntry(runEntry?.data);
}

export function restoreCycleThoughtEntry(ctx: ExtensionContext): CycleThoughtEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const thoughtEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === CYCLE_THOUGHT_ENTRY_TYPE)
    .pop() as { data?: CycleThoughtEntry } | undefined;

  return thoughtEntry?.data ?? null;
}
