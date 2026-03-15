import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { FocusDecision } from "../../contracts/focus-decision.ts";
import type {
  AiesAuditRecommendedActionType,
} from "../../contracts/layer-audit-snapshot.ts";
import type {
  AiesDimension,
  FocusType,
  IsoTimestamp,
  VerificationMode,
  VerificationResult,
  VerificationState,
} from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import type { AuditRadarGuidance } from "./audit-radar-guidance.ts";

export type AuditGuidanceAlignmentStatus = "aligned" | "partially_aligned" | "diverged" | "insufficient_evidence";

export interface AuditGuidanceCapturedBrief {
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
}

export interface AuditGuidanceOutcomeReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  sessionId: string;
  runId: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  promptSummary: string;
  guidance: AuditGuidanceCapturedBrief;
  actual: {
    cycleFocusType: FocusType | null;
    cycleLinkedDimensions: AiesDimension[];
    cycleLinkedChangeId: string | null;
    cycleRationale: string | null;
    verificationMode: VerificationMode | null;
    verificationResult: VerificationResult | null;
    verificationState: VerificationState | null;
    recoveryId: string | null;
  };
  alignment: {
    status: AuditGuidanceAlignmentStatus;
    focusTypeAligned: boolean;
    activeChangeAligned: boolean;
    matchedTargetDimensions: AiesDimension[];
    summary: string;
  };
}

interface CreateAuditGuidanceOutcomeArgs {
  sessionId: string;
  runId: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  promptSummary: string;
  guidance: AuditGuidanceCapturedBrief;
  cycleFocus: FocusDecision | null;
  cycleRationale: string | null;
  cycleActiveChangeId: string | null;
  verificationMode: VerificationMode | null;
  verificationResult: VerificationResult | null;
  verificationState: VerificationState | null;
  recoveryId: string | null;
}

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(): string {
  return `audit-guidance-outcome-${Date.now()}`;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function compact(text: string | null | undefined, maxLength = 220): string {
  const normalized = normalize(String(text ?? ""));
  if (!normalized) {
    return "none";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function normalizeReportFileName(report: AuditGuidanceOutcomeReport): string {
  const safeGeneratedAt = report.generatedAt.replace(/[:.]/g, "-");
  const safeReportId = report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-");
  return `${safeGeneratedAt}--${safeReportId}.json`;
}

function hasArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAuditGuidanceOutcomeReport(value: unknown): value is AuditGuidanceOutcomeReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceOutcomeReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.sessionId === "string"
    && typeof candidate.runId === "string"
    && typeof candidate.promptSummary === "string"
    && Boolean(candidate.guidance)
    && Boolean(candidate.actual)
    && Boolean(candidate.alignment)
    && typeof candidate.alignment?.status === "string"
    && hasArrayOfStrings(candidate.actual?.cycleLinkedDimensions)
    && hasArrayOfStrings(candidate.alignment?.matchedTargetDimensions)
    && hasArrayOfStrings(candidate.guidance?.targetDimensions)
    && hasArrayOfStrings(candidate.guidance?.suggestedPaths);
}

export function captureAuditGuidanceBrief(guidance: AuditRadarGuidance): AuditGuidanceCapturedBrief {
  return {
    snapshotId: guidance.snapshotId,
    observedAt: guidance.observedAt,
    activeChangeId: guidance.activeChangeId,
    continueActiveChange: guidance.continueActiveChange,
    recommendedFocusType: guidance.recommendedFocusType,
    actionType: guidance.actionType,
    bindingConstraint: guidance.bindingConstraint,
    targetDimensions: [...guidance.targetDimensions],
    suggestedPaths: [...guidance.suggestedPaths],
    summary: guidance.summary,
    rationale: guidance.rationale,
    driftSummary: guidance.driftSummary,
    latestLoopGeneratedAt: guidance.latestLoopGeneratedAt,
    latestLoopSource: guidance.latestLoopSource,
    latestLoopVerification: guidance.latestLoopVerification,
    latestLoopReportPath: guidance.latestLoopReportPath,
    learningPosture: guidance.learningPosture,
    learningSummary: guidance.learningSummary,
    learningRecommendation: guidance.learningRecommendation,
    learningRelevantItemCount: guidance.learningRelevantItemCount,
    learningReportGeneratedAt: guidance.learningReportGeneratedAt,
    learningReportPath: guidance.learningReportPath,
  };
}

function summarizeAlignment(
  guidance: AuditGuidanceCapturedBrief,
  cycleFocus: FocusDecision | null,
  activeChangeId: string | null,
  matchedTargetDimensions: AiesDimension[],
  focusTypeAligned: boolean,
  activeChangeAligned: boolean,
): { status: AuditGuidanceAlignmentStatus; summary: string } {
  if (!cycleFocus) {
    return {
      status: "insufficient_evidence",
      summary: `No explicit cycle focus was recorded, so guidance from ${guidance.snapshotId} could not be compared against a concrete decision.`,
    };
  }

  if (focusTypeAligned && (guidance.activeChangeId ? activeChangeAligned : true)) {
    return {
      status: matchedTargetDimensions.length > 0 || guidance.targetDimensions.length === 0 || guidance.recommendedFocusType === "active_change_continuation"
        ? "aligned"
        : "partially_aligned",
      summary: matchedTargetDimensions.length > 0
        ? `Cycle focus matched ${guidance.recommendedFocusType} and overlapped target dimensions ${matchedTargetDimensions.join(", ")}.`
        : `Cycle focus matched ${guidance.recommendedFocusType}${guidance.activeChangeId ? ` and continued ${activeChangeId ?? guidance.activeChangeId}` : ""}.`,
    };
  }

  if (focusTypeAligned || activeChangeAligned || matchedTargetDimensions.length > 0) {
    const reasons = [
      focusTypeAligned ? `focus matched ${guidance.recommendedFocusType}` : null,
      activeChangeAligned ? `active change matched ${guidance.activeChangeId}` : null,
      matchedTargetDimensions.length > 0 ? `dimension overlap: ${matchedTargetDimensions.join(", ")}` : null,
    ].filter((item): item is string => Boolean(item));

    return {
      status: "partially_aligned",
      summary: `Cycle followed the guidance only partially (${reasons.join("; ") || "some overlap detected"}).`,
    };
  }

  return {
    status: "diverged",
    summary: `Cycle focus diverged from guidance: expected ${guidance.recommendedFocusType} around ${guidance.targetDimensions.join(", ") || guidance.bindingConstraint}, observed ${cycleFocus.focusType}.`,
  };
}

export function createAuditGuidanceOutcomeReport(args: CreateAuditGuidanceOutcomeArgs): AuditGuidanceOutcomeReport {
  const cycleLinkedDimensions = args.cycleFocus?.linkedDimensions ?? [];
  const cycleLinkedChangeId = args.cycleFocus?.linkedChangeId ?? args.cycleActiveChangeId;
  const focusTypeAligned = args.cycleFocus?.focusType === args.guidance.recommendedFocusType;
  const activeChangeAligned = Boolean(args.guidance.activeChangeId && cycleLinkedChangeId && args.guidance.activeChangeId === cycleLinkedChangeId);
  const matchedTargetDimensions = args.guidance.targetDimensions.filter((dimension) => cycleLinkedDimensions.includes(dimension));
  const alignment = summarizeAlignment(
    args.guidance,
    args.cycleFocus,
    cycleLinkedChangeId,
    matchedTargetDimensions,
    focusTypeAligned,
    activeChangeAligned,
  );

  return {
    reportId: createReportId(),
    generatedAt: nowIso(),
    sessionId: args.sessionId,
    runId: args.runId,
    relatedCycleId: args.relatedCycleId,
    relatedChangeId: args.relatedChangeId,
    promptSummary: compact(args.promptSummary),
    guidance: args.guidance,
    actual: {
      cycleFocusType: args.cycleFocus?.focusType ?? null,
      cycleLinkedDimensions,
      cycleLinkedChangeId,
      cycleRationale: args.cycleRationale,
      verificationMode: args.verificationMode,
      verificationResult: args.verificationResult,
      verificationState: args.verificationState,
      recoveryId: args.recoveryId,
    },
    alignment: {
      status: alignment.status,
      focusTypeAligned,
      activeChangeAligned,
      matchedTargetDimensions,
      summary: alignment.summary,
    },
  };
}

export function ensureAuditGuidanceOutcomeDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceOutcomesRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function persistAuditGuidanceOutcomeReport(report: AuditGuidanceOutcomeReport): string {
  const directory = ensureAuditGuidanceOutcomeDirectory();
  const fullPath = join(directory, normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceOutcomeHistory(limit = 25): AuditGuidanceOutcomeReport[] {
  const directory = ensureAuditGuidanceOutcomeDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceOutcomeReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceOutcomeReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceOutcomeReport(): AuditGuidanceOutcomeReport | null {
  const history = loadAuditGuidanceOutcomeHistory(1);
  return history[0] ?? null;
}

export function formatAuditGuidanceOutcomeReport(report: AuditGuidanceOutcomeReport): string {
  return [
    `Audit guidance outcome: ${report.reportId}`,
    `Generated: ${report.generatedAt}`,
    `Run: ${report.runId}`,
    `Session: ${report.sessionId}`,
    `Related cycle: ${report.relatedCycleId ?? "none"}`,
    `Related change: ${report.relatedChangeId ?? "none"}`,
    `Prompt summary: ${report.promptSummary}`,
    `Guidance snapshot: ${report.guidance.snapshotId}`,
    `Guidance summary: ${report.guidance.summary}`,
    `Guidance focus: ${report.guidance.recommendedFocusType}`,
    `Guidance action: ${report.guidance.actionType}`,
    `Guidance targets: ${report.guidance.targetDimensions.join(", ") || "none"}`,
    `Guidance learning posture: ${report.guidance.learningPosture ?? "baseline"}`,
    `Guidance learning signal: ${report.guidance.learningSummary ?? "none"}`,
    `Guidance learning recommendation: ${report.guidance.learningRecommendation ?? "none"}`,
    `Observed focus: ${report.actual.cycleFocusType ?? "none"}`,
    `Observed dimensions: ${report.actual.cycleLinkedDimensions.join(", ") || "none"}`,
    `Observed linked change: ${report.actual.cycleLinkedChangeId ?? "none"}`,
    `Alignment: ${report.alignment.status}`,
    `Alignment detail: ${report.alignment.summary}`,
    `Matched target dimensions: ${report.alignment.matchedTargetDimensions.join(", ") || "none"}`,
    `Verification: ${report.actual.verificationMode && report.actual.verificationResult ? `${report.actual.verificationMode}/${report.actual.verificationResult}` : "none"}`,
    `Recovery: ${report.actual.recoveryId ?? "none"}`,
  ].join("\n");
}
