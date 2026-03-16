import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  latestAuditGuidanceExperimentReport,
  type AuditGuidanceExperimentReport,
  type AuditGuidanceExperimentType,
} from "./audit-radar-guidance-experiment.ts";
import {
  loadAuditGuidanceEffectivenessHistory,
  type AuditGuidanceEffectivenessItem,
  type AuditGuidanceEffectivenessReport,
  type AuditGuidanceEffectivenessVerdict,
} from "./audit-radar-guidance-effectiveness.ts";
import type {
  AuditGuidanceAlignmentStatus,
  AuditGuidanceCapturedBrief,
  AuditGuidanceOutcomeReport,
} from "./audit-radar-guidance-outcomes.ts";
import { loadAuditGuidanceOutcomeHistory } from "./audit-radar-guidance-outcomes.ts";
import type { AuditGuidanceLearningPosture } from "./audit-radar-guidance-learning.ts";

export type AuditGuidanceExperimentExecutionStatus = "not_started" | "in_progress" | "completed";
export type AuditGuidanceExperimentSignal = "supportive" | "counter" | "mixed" | "insufficient";

export interface AuditGuidanceExperimentReviewReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  sourceKind: "persisted_experiment" | "captured_guidance";
  sourceExperimentReportId: string | null;
  sourceExperimentReportPath: string | null;
  sourceGeneratedAt: IsoTimestamp | null;
  sourceObservedAt: IsoTimestamp | null;
  sourceSnapshotId: string | null;
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  currentLearningPosture: AuditGuidanceLearningPosture | null;
  recommendedNextPosture: AuditGuidanceLearningPosture;
  experimentType: AuditGuidanceExperimentType;
  plannedRelevantCycles: number;
  observedRelevantCycles: number;
  analyzedRelevantCycles: number;
  linkedPostRunAuditCount: number;
  verificationFloorEscalationCount: number;
  alignmentCounts: Record<AuditGuidanceAlignmentStatus, number>;
  verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number>;
  executionStatus: AuditGuidanceExperimentExecutionStatus;
  signalDirection: AuditGuidanceExperimentSignal;
  latestLinkedRunId: string | null;
  latestLinkedOutcomeGeneratedAt: IsoTimestamp | null;
  summary: string;
  rationale: string;
}

interface ExperimentReviewSource {
  sourceKind: "persisted_experiment" | "captured_guidance";
  sourceExperimentReportId: string | null;
  sourceExperimentReportPath: string | null;
  sourceGeneratedAt: IsoTimestamp | null;
  sourceObservedAt: IsoTimestamp | null;
  sourceSnapshotId: string | null;
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  currentLearningPosture: AuditGuidanceLearningPosture | null;
  recommendedNextPosture: AuditGuidanceLearningPosture;
  experimentType: AuditGuidanceExperimentType;
  plannedRelevantCycles: number;
}

interface SourcedEffectivenessItem {
  sourceGeneratedAt: IsoTimestamp;
  item: AuditGuidanceEffectivenessItem;
}

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(generatedAt: IsoTimestamp): string {
  return `audit-guidance-experiment-review-${generatedAt.replace(/[:.]/g, "-")}`;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 260): string {
  const compact = normalize(text);
  if (!compact) {
    return "none";
  }

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function ensureAuditGuidanceExperimentReviewDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceExperimentReviewsRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

function normalizeReportFileName(report: AuditGuidanceExperimentReviewReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePosture(value: string | null | undefined): AuditGuidanceLearningPosture | null {
  switch (value) {
    case "baseline":
    case "reinforce":
    case "cautious":
    case "exploratory":
    case "mixed":
      return value;
    default:
      return null;
  }
}

function normalizeExperimentType(value: string | null | undefined): AuditGuidanceExperimentType | null {
  switch (value) {
    case "hold_baseline":
    case "probe_nonbaseline":
    case "reinforce_nonbaseline":
    case "reset_to_baseline":
    case "compare_mixed":
      return value;
    default:
      return null;
  }
}

function normalizeDimensions(bindingConstraint: AiesDimension, targetDimensions: AiesDimension[]): AiesDimension[] {
  const dimensions = targetDimensions.length > 0 ? targetDimensions : [bindingConstraint];
  return [...new Set(dimensions)].sort();
}

function sameDimensions(left: AiesDimension[], right: AiesDimension[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((dimension, index) => dimension === right[index]);
}

function createAlignmentCounts(): Record<AuditGuidanceAlignmentStatus, number> {
  return {
    aligned: 0,
    partially_aligned: 0,
    diverged: 0,
    insufficient_evidence: 0,
  };
}

function createVerdictCounts(): Record<AuditGuidanceEffectivenessVerdict, number> {
  return {
    supportive_signal: 0,
    counter_signal: 0,
    alternative_signal: 0,
    mixed_signal: 0,
    insufficient_evidence: 0,
  };
}

function flattenEffectivenessHistory(reports: AuditGuidanceEffectivenessReport[]): SourcedEffectivenessItem[] {
  return reports.flatMap((report) => report.items.map((item) => ({
    sourceGeneratedAt: report.generatedAt,
    item,
  })));
}

function dedupeLatestEffectivenessItems(reports: AuditGuidanceEffectivenessReport[]): Map<string, AuditGuidanceEffectivenessItem> {
  const latestByOutcome = new Map<string, SourcedEffectivenessItem>();
  const flattened = flattenEffectivenessHistory(reports)
    .sort((left, right) => right.sourceGeneratedAt.localeCompare(left.sourceGeneratedAt));

  for (const entry of flattened) {
    if (!latestByOutcome.has(entry.item.guidanceOutcomeReportId)) {
      latestByOutcome.set(entry.item.guidanceOutcomeReportId, entry);
    }
  }

  return new Map([...latestByOutcome.entries()].map(([key, value]) => [key, value.item]));
}

function readExperimentReportByRelativePath(relativePath: string | null | undefined): AuditGuidanceExperimentReport | null {
  const normalized = String(relativePath ?? "").trim();
  if (!normalized) {
    return null;
  }

  const fullPath = resolve(getAiesPaths().projectRoot, normalized);
  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const candidate = parsed as Partial<AuditGuidanceExperimentReport>;
    return typeof candidate.reportId === "string"
      && typeof candidate.generatedAt === "string"
      && typeof candidate.bindingConstraint === "string"
      && Array.isArray(candidate.targetDimensions)
      && typeof candidate.currentLearningPosture === "string"
      && typeof candidate.recommendedNextPosture === "string"
      && typeof candidate.experimentType === "string"
      && typeof candidate.plannedRelevantCycles === "number"
      && typeof candidate.summary === "string"
      && typeof candidate.rationale === "string"
      ? candidate as AuditGuidanceExperimentReport
      : null;
  } catch {
    return null;
  }
}

function sourceFromExperimentReport(report: AuditGuidanceExperimentReport, relativePath: string | null): ExperimentReviewSource {
  return {
    sourceKind: "persisted_experiment",
    sourceExperimentReportId: report.reportId,
    sourceExperimentReportPath: relativePath,
    sourceGeneratedAt: report.generatedAt,
    sourceObservedAt: null,
    sourceSnapshotId: null,
    bindingConstraint: report.bindingConstraint,
    targetDimensions: [...report.targetDimensions],
    currentLearningPosture: report.currentLearningPosture,
    recommendedNextPosture: report.recommendedNextPosture,
    experimentType: report.experimentType,
    plannedRelevantCycles: report.plannedRelevantCycles,
  };
}

function sourceFromCapturedGuidance(guidance: AuditGuidanceCapturedBrief): ExperimentReviewSource | null {
  const experimentType = normalizeExperimentType(guidance.experimentType);
  const recommendedNextPosture = normalizePosture(guidance.experimentNextPosture ?? null);
  if (!experimentType || !recommendedNextPosture || guidance.experimentPlannedRelevantCycles <= 0) {
    return null;
  }

  return {
    sourceKind: "captured_guidance",
    sourceExperimentReportId: null,
    sourceExperimentReportPath: guidance.experimentReportPath,
    sourceGeneratedAt: guidance.experimentReportGeneratedAt,
    sourceObservedAt: guidance.observedAt,
    sourceSnapshotId: guidance.snapshotId,
    bindingConstraint: guidance.bindingConstraint,
    targetDimensions: [...guidance.targetDimensions],
    currentLearningPosture: normalizePosture(guidance.learningPosture),
    recommendedNextPosture,
    experimentType,
    plannedRelevantCycles: guidance.experimentPlannedRelevantCycles,
  };
}

function resolveSource(source?: AuditGuidanceCapturedBrief | string | null): ExperimentReviewSource | null {
  if (typeof source === "string") {
    const report = readExperimentReportByRelativePath(source);
    return report ? sourceFromExperimentReport(report, source) : null;
  }

  if (source) {
    return sourceFromCapturedGuidance(source);
  }

  const latestReport = latestAuditGuidanceExperimentReport();
  const latestPath = (() => {
    const directory = getAiesPaths().auditRadarGuidanceExperimentsRoot;
    if (!existsSync(directory)) {
      return null;
    }

    const candidate = readdirSync(directory)
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return candidate ? projectRelativePath(join(directory, candidate)) : null;
  })();

  return latestReport ? sourceFromExperimentReport(latestReport, latestPath) : null;
}

function matchesExperimentSignature(report: AuditGuidanceOutcomeReport, source: ExperimentReviewSource): boolean {
  const guidance = report.guidance;
  if (!guidance.experimentType || !guidance.experimentNextPosture) {
    return false;
  }

  if (guidance.bindingConstraint !== source.bindingConstraint) {
    return false;
  }
  if (guidance.experimentType !== source.experimentType) {
    return false;
  }
  if (guidance.experimentNextPosture !== source.recommendedNextPosture) {
    return false;
  }
  if (guidance.experimentPlannedRelevantCycles !== source.plannedRelevantCycles) {
    return false;
  }

  const outcomeDimensions = normalizeDimensions(guidance.bindingConstraint, guidance.targetDimensions);
  const sourceDimensions = normalizeDimensions(source.bindingConstraint, source.targetDimensions);
  if (!sameDimensions(outcomeDimensions, sourceDimensions)) {
    return false;
  }

  const reportTime = parseTime(report.generatedAt);
  const sourceTime = parseTime(source.sourceGeneratedAt ?? source.sourceObservedAt);
  if (reportTime !== null && sourceTime !== null && reportTime < sourceTime) {
    return false;
  }

  return true;
}

function executionStatus(observedRelevantCycles: number, plannedRelevantCycles: number): AuditGuidanceExperimentExecutionStatus {
  if (observedRelevantCycles === 0) {
    return "not_started";
  }

  return observedRelevantCycles >= plannedRelevantCycles ? "completed" : "in_progress";
}

function signalDirection(verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number>): AuditGuidanceExperimentSignal {
  const constructive = verdictCounts.supportive_signal + verdictCounts.alternative_signal;
  const adverse = verdictCounts.counter_signal;
  const mixed = verdictCounts.mixed_signal;
  const analyzed = constructive + adverse + mixed;

  if (analyzed === 0) {
    return "insufficient";
  }
  if (constructive > adverse && constructive >= mixed) {
    return "supportive";
  }
  if (adverse > constructive && adverse >= mixed) {
    return "counter";
  }
  return "mixed";
}

function sourceLabel(source: ExperimentReviewSource): string {
  return `${source.experimentType} -> ${source.recommendedNextPosture}`;
}

function summaryText(args: {
  source: ExperimentReviewSource;
  observedRelevantCycles: number;
  analyzedRelevantCycles: number;
  executionStatus: AuditGuidanceExperimentExecutionStatus;
  signalDirection: AuditGuidanceExperimentSignal;
  verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number>;
}): string {
  const dimensions = normalizeDimensions(args.source.bindingConstraint, args.source.targetDimensions).join(", ");

  if (args.observedRelevantCycles === 0) {
    return shorten(`Experiment ${sourceLabel(args.source)} for ${dimensions} has not been exercised by any matching guided cycle yet.`);
  }

  const progress = `${args.observedRelevantCycles}/${args.source.plannedRelevantCycles}`;
  const signal = args.signalDirection === "insufficient"
    ? `no linked effectiveness signal yet`
    : `early signal ${args.signalDirection} (supportive=${args.verdictCounts.supportive_signal}, counter=${args.verdictCounts.counter_signal}, alternative=${args.verdictCounts.alternative_signal}, mixed=${args.verdictCounts.mixed_signal})`;

  return shorten(`Experiment ${sourceLabel(args.source)} for ${dimensions} is ${args.executionStatus} at ${progress} planned relevant cycles with ${signal} across ${args.analyzedRelevantCycles} analyzed outcome${args.analyzedRelevantCycles === 1 ? "" : "s"}.`);
}

function rationaleText(args: {
  source: ExperimentReviewSource;
  observedRelevantCycles: number;
  analyzedRelevantCycles: number;
  alignmentCounts: Record<AuditGuidanceAlignmentStatus, number>;
  linkedPostRunAuditCount: number;
  verificationFloorEscalationCount: number;
}): string {
  const dimensions = normalizeDimensions(args.source.bindingConstraint, args.source.targetDimensions).join(", ");

  return shorten([
    `This review groups guidance outcomes by the bounded experiment signature ${sourceLabel(args.source)} across ${dimensions}.`,
    `Observed relevant cycles: ${args.observedRelevantCycles}.`,
    `Analyzed effectiveness items: ${args.analyzedRelevantCycles}.`,
    `Alignment counts: aligned=${args.alignmentCounts.aligned}, partial=${args.alignmentCounts.partially_aligned}, diverged=${args.alignmentCounts.diverged}, insufficient=${args.alignmentCounts.insufficient_evidence}.`,
    `Linked post-run audits: ${args.linkedPostRunAuditCount}.`,
    `Verification floor escalations: ${args.verificationFloorEscalationCount}.`,
  ].join(" "), 320);
}

function isAuditGuidanceExperimentReviewReport(value: unknown): value is AuditGuidanceExperimentReviewReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceExperimentReviewReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.bindingConstraint === "string"
    && Array.isArray(candidate.targetDimensions)
    && typeof candidate.experimentType === "string"
    && typeof candidate.recommendedNextPosture === "string"
    && typeof candidate.plannedRelevantCycles === "number"
    && typeof candidate.observedRelevantCycles === "number"
    && typeof candidate.analyzedRelevantCycles === "number"
    && typeof candidate.executionStatus === "string"
    && typeof candidate.signalDirection === "string"
    && typeof candidate.summary === "string"
    && typeof candidate.rationale === "string";
}

export function createAuditGuidanceExperimentReviewReport(
  source?: AuditGuidanceCapturedBrief | string | null,
): AuditGuidanceExperimentReviewReport | null {
  const resolvedSource = resolveSource(source);
  if (!resolvedSource) {
    return null;
  }

  const outcomes = loadAuditGuidanceOutcomeHistory(0)
    .filter((report) => matchesExperimentSignature(report, resolvedSource))
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
  const latestEffectivenessByOutcomeId = dedupeLatestEffectivenessItems(loadAuditGuidanceEffectivenessHistory(0));
  const effectivenessItems = outcomes
    .map((report) => latestEffectivenessByOutcomeId.get(report.reportId) ?? null)
    .filter((item): item is AuditGuidanceEffectivenessItem => item !== null);
  const alignmentCounts = createAlignmentCounts();
  const verdictCounts = createVerdictCounts();

  for (const outcome of outcomes) {
    alignmentCounts[outcome.alignment.status] += 1;
  }

  let linkedPostRunAuditCount = 0;
  let verificationFloorEscalationCount = 0;
  for (const item of effectivenessItems) {
    verdictCounts[item.verdict] += 1;
    if (item.linkedPostRunAudit.loopId) {
      linkedPostRunAuditCount += 1;
    }
    if (item.verification.floorEscalated) {
      verificationFloorEscalationCount += 1;
    }
  }

  const observedRelevantCycles = outcomes.length;
  const analyzedRelevantCycles = effectivenessItems.length;
  const currentExecutionStatus = executionStatus(observedRelevantCycles, resolvedSource.plannedRelevantCycles);
  const currentSignalDirection = signalDirection(verdictCounts);
  const generatedAt = nowIso();
  const latestOutcome = outcomes[outcomes.length - 1] ?? null;

  return {
    reportId: createReportId(generatedAt),
    generatedAt,
    sourceKind: resolvedSource.sourceKind,
    sourceExperimentReportId: resolvedSource.sourceExperimentReportId,
    sourceExperimentReportPath: resolvedSource.sourceExperimentReportPath,
    sourceGeneratedAt: resolvedSource.sourceGeneratedAt,
    sourceObservedAt: resolvedSource.sourceObservedAt,
    sourceSnapshotId: resolvedSource.sourceSnapshotId,
    bindingConstraint: resolvedSource.bindingConstraint,
    targetDimensions: [...resolvedSource.targetDimensions],
    currentLearningPosture: resolvedSource.currentLearningPosture,
    recommendedNextPosture: resolvedSource.recommendedNextPosture,
    experimentType: resolvedSource.experimentType,
    plannedRelevantCycles: resolvedSource.plannedRelevantCycles,
    observedRelevantCycles,
    analyzedRelevantCycles,
    linkedPostRunAuditCount,
    verificationFloorEscalationCount,
    alignmentCounts,
    verdictCounts,
    executionStatus: currentExecutionStatus,
    signalDirection: currentSignalDirection,
    latestLinkedRunId: latestOutcome?.runId ?? null,
    latestLinkedOutcomeGeneratedAt: latestOutcome?.generatedAt ?? null,
    summary: summaryText({
      source: resolvedSource,
      observedRelevantCycles,
      analyzedRelevantCycles,
      executionStatus: currentExecutionStatus,
      signalDirection: currentSignalDirection,
      verdictCounts,
    }),
    rationale: rationaleText({
      source: resolvedSource,
      observedRelevantCycles,
      analyzedRelevantCycles,
      alignmentCounts,
      linkedPostRunAuditCount,
      verificationFloorEscalationCount,
    }),
  };
}

export function persistAuditGuidanceExperimentReviewReport(report: AuditGuidanceExperimentReviewReport): string {
  const fullPath = join(ensureAuditGuidanceExperimentReviewDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceExperimentReviewHistory(limit = 10): AuditGuidanceExperimentReviewReport[] {
  const directory = ensureAuditGuidanceExperimentReviewDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceExperimentReviewReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceExperimentReviewReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceExperimentReviewReport(): AuditGuidanceExperimentReviewReport | null {
  return loadAuditGuidanceExperimentReviewHistory(1)[0] ?? null;
}

export function latestAuditGuidanceExperimentReviewReportPath(): string | null {
  const root = getAiesPaths().auditRadarGuidanceExperimentReviewsRoot;
  if (!existsSync(root)) {
    return null;
  }

  const candidate = readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return candidate ? projectRelativePath(join(root, candidate)) : null;
}

export function formatAuditGuidanceExperimentReviewReport(report: AuditGuidanceExperimentReviewReport): string {
  return [
    `Audit guidance experiment review @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Source kind: ${report.sourceKind}`,
    `Source experiment: ${report.sourceExperimentReportPath ?? report.sourceExperimentReportId ?? "captured-guidance-only"}`,
    `Source snapshot: ${report.sourceSnapshotId ?? "none"}`,
    `Binding constraint: ${report.bindingConstraint}`,
    `Target dimensions: ${report.targetDimensions.join(", ") || "none"}`,
    `Current learning posture: ${report.currentLearningPosture ?? "none"}`,
    `Recommended next posture: ${report.recommendedNextPosture}`,
    `Experiment type: ${report.experimentType}`,
    `Planned relevant cycles: ${report.plannedRelevantCycles}`,
    `Observed relevant cycles: ${report.observedRelevantCycles}`,
    `Analyzed relevant cycles: ${report.analyzedRelevantCycles}`,
    `Execution status: ${report.executionStatus}`,
    `Signal direction: ${report.signalDirection}`,
    `Alignment counts: aligned=${report.alignmentCounts.aligned}, partial=${report.alignmentCounts.partially_aligned}, diverged=${report.alignmentCounts.diverged}, insufficient=${report.alignmentCounts.insufficient_evidence}`,
    `Verdict counts: supportive=${report.verdictCounts.supportive_signal}, counter=${report.verdictCounts.counter_signal}, alternative=${report.verdictCounts.alternative_signal}, mixed=${report.verdictCounts.mixed_signal}, insufficient=${report.verdictCounts.insufficient_evidence}`,
    `Linked post-run audits: ${report.linkedPostRunAuditCount}`,
    `Verification floor escalations: ${report.verificationFloorEscalationCount}`,
    `Latest linked run: ${report.latestLinkedRunId ?? "none"}`,
    `Latest linked outcome: ${report.latestLinkedOutcomeGeneratedAt ?? "none"}`,
    `Summary: ${report.summary}`,
    `Rationale: ${report.rationale}`,
  ].join("\n");
}
