import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension, IsoTimestamp, VerificationMode, VerificationResult, VerificationState } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import type { AuditGuidanceAlignmentStatus, AuditGuidanceOutcomeReport } from "./audit-radar-guidance-outcomes.ts";
import { loadAuditGuidanceOutcomeHistory } from "./audit-radar-guidance-outcomes.ts";
import type { AuditLoopReport } from "./audit-radar-loop.ts";
import { loadAuditLoopHistory } from "./audit-radar-loop.ts";
import type { AuditCorrectionPath, AuditOutcomeComparison, AuditOutcomeReport } from "./audit-radar-outcomes.ts";
import { loadAuditOutcomeReportHistory } from "./audit-radar-outcomes.ts";
import { loadAuditSnapshotHistory } from "./audit-radar-state.ts";

export type AuditGuidanceEffectivenessVerdict =
  | "supportive_signal"
  | "counter_signal"
  | "alternative_signal"
  | "mixed_signal"
  | "insufficient_evidence";

export type AuditGuidanceTargetDimensionOutcome = "improved" | "regressed" | "stagnant" | "not_compared";

export interface AuditGuidanceTargetDimensionEffect {
  dimension: AiesDimension;
  outcome: AuditGuidanceTargetDimensionOutcome;
}

export interface AuditGuidanceEffectivenessItem {
  guidanceOutcomeReportId: string;
  guidanceOutcomeGeneratedAt: IsoTimestamp;
  sessionId: string;
  runId: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  guidanceSnapshotId: string;
  guidanceBindingConstraint: AiesDimension;
  alignmentStatus: AuditGuidanceAlignmentStatus;
  trackedDimensions: AiesDimension[];
  matchedTargetDimensions: AiesDimension[];
  verification: {
    requestedMode: VerificationMode | null;
    scopeRecommendedMode: VerificationMode | null;
    effectiveMode: VerificationMode | null;
    recordedMode: VerificationMode | null;
    recordedResult: VerificationResult | null;
    recordedState: VerificationState | null;
    floorEscalated: boolean;
  };
  linkedPostRunAudit: {
    loopId: string | null;
    loopGeneratedAt: IsoTimestamp | null;
    snapshotId: string | null;
    outcomeReportId: string | null;
    bindingConstraintAfter: AiesDimension | null;
    bindingConstraintOutcome: "persisted" | "shifted" | "unknown";
  };
  targetDimensionEffects: AuditGuidanceTargetDimensionEffect[];
  correctionPathsObserved: AuditCorrectionPath[];
  correctionPathEvidence: string[];
  verdict: AuditGuidanceEffectivenessVerdict;
  summary: string;
}

export interface AuditGuidanceEffectivenessReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  guidanceOutcomeCount: number;
  analyzedCount: number;
  linkedPostRunAuditCount: number;
  floorEscalationCount: number;
  verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number>;
  items: AuditGuidanceEffectivenessItem[];
  summary: string;
}

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(generatedAt: IsoTimestamp): string {
  return `audit-guidance-effectiveness-${generatedAt.replace(/[:.]/g, "-")}`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
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

function normalizeReportFileName(report: AuditGuidanceEffectivenessReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function ensureAuditGuidanceEffectivenessDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceEffectivenessRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function verificationModeRank(mode: VerificationMode | null): number {
  switch (mode) {
    case "full":
      return 3;
    case "fast":
      return 2;
    case "targeted":
      return 1;
    case "none":
      return 0;
    default:
      return -1;
  }
}

function trackedDimensions(report: AuditGuidanceOutcomeReport): AiesDimension[] {
  const dimensions = report.guidance.targetDimensions.length > 0
    ? report.guidance.targetDimensions
    : [report.guidance.bindingConstraint];
  return [...new Set(dimensions)];
}

function sameSession(loop: AuditLoopReport, report: AuditGuidanceOutcomeReport): boolean {
  return Boolean(loop.sessionPath && loop.sessionPath === report.sessionId);
}

function chooseLinkedLoop(report: AuditGuidanceOutcomeReport, loops: AuditLoopReport[]): AuditLoopReport | null {
  const reportTime = parseTime(report.generatedAt);
  if (reportTime === null) {
    return null;
  }

  const candidates = loops
    .filter((loop) => {
      const loopTime = parseTime(loop.generatedAt);
      if (loopTime === null || loopTime > reportTime) {
        return false;
      }

      if (report.relatedCycleId && loop.relatedCycleId) {
        return loop.relatedCycleId === report.relatedCycleId;
      }

      if (sameSession(loop, report) && report.relatedChangeId && loop.relatedChangeId) {
        return loop.relatedChangeId === report.relatedChangeId;
      }

      return sameSession(loop, report);
    })
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));

  return candidates[0] ?? null;
}

function chooseOutcomeComparison(
  loop: AuditLoopReport | null,
  outcomesById: Map<string, AuditOutcomeReport>,
): AuditOutcomeComparison | null {
  if (!loop?.outcomeReportId) {
    return null;
  }

  const report = outcomesById.get(loop.outcomeReportId);
  if (!report) {
    return null;
  }

  return report.comparisons.find((comparison) => comparison.currentSnapshotId === loop.snapshotId) ?? null;
}

function targetDimensionOutcome(
  dimension: AiesDimension,
  comparison: AuditOutcomeComparison | null,
): AuditGuidanceTargetDimensionOutcome {
  if (!comparison) {
    return "not_compared";
  }

  if (comparison.improvedDimensions.includes(dimension)) {
    return "improved";
  }
  if (comparison.regressedDimensions.includes(dimension)) {
    return "regressed";
  }
  if (comparison.stagnantWeakDimensions.includes(dimension)) {
    return "stagnant";
  }
  return "not_compared";
}

function bindingConstraintOutcome(
  before: AiesDimension,
  after: AiesDimension | null,
): "persisted" | "shifted" | "unknown" {
  if (!after) {
    return "unknown";
  }

  return before === after ? "persisted" : "shifted";
}

function summarizeVerdict(args: {
  alignmentStatus: AuditGuidanceAlignmentStatus;
  trackedDimensions: AiesDimension[];
  effects: AuditGuidanceTargetDimensionEffect[];
  bindingConstraintOutcome: "persisted" | "shifted" | "unknown";
  linkedLoop: AuditLoopReport | null;
}): AuditGuidanceEffectivenessVerdict {
  if (!args.linkedLoop) {
    return "insufficient_evidence";
  }

  const improved = args.effects.filter((item) => item.outcome === "improved").map((item) => item.dimension);
  const regressed = args.effects.filter((item) => item.outcome === "regressed").map((item) => item.dimension);
  const stagnant = args.effects.filter((item) => item.outcome === "stagnant").map((item) => item.dimension);
  const positive = improved.length > 0 || args.bindingConstraintOutcome === "shifted";
  const negative = regressed.length > 0 || stagnant.length > 0;

  if (args.alignmentStatus === "aligned") {
    if (positive && !negative) {
      return "supportive_signal";
    }
    if (negative && !positive) {
      return "counter_signal";
    }
    return "mixed_signal";
  }

  if (args.alignmentStatus === "diverged") {
    return positive ? "alternative_signal" : negative ? "mixed_signal" : "mixed_signal";
  }

  if (args.alignmentStatus === "insufficient_evidence") {
    return "insufficient_evidence";
  }

  return positive || negative || args.trackedDimensions.length > 0 ? "mixed_signal" : "insufficient_evidence";
}

function summarizeItem(args: {
  report: AuditGuidanceOutcomeReport;
  trackedDimensions: AiesDimension[];
  effects: AuditGuidanceTargetDimensionEffect[];
  linkedLoop: AuditLoopReport | null;
  comparison: AuditOutcomeComparison | null;
  verdict: AuditGuidanceEffectivenessVerdict;
  bindingOutcome: "persisted" | "shifted" | "unknown";
  floorEscalated: boolean;
}): string {
  if (!args.linkedLoop) {
    return `No post-run audit loop could be linked to guidance outcome ${args.report.reportId}, so guidance effectiveness is still unmeasured.`;
  }

  const improved = args.effects.filter((item) => item.outcome === "improved").map((item) => item.dimension);
  const regressed = args.effects.filter((item) => item.outcome === "regressed").map((item) => item.dimension);
  const stagnant = args.effects.filter((item) => item.outcome === "stagnant").map((item) => item.dimension);
  const paths = args.comparison?.pathsObserved.join(", ") || "none";
  const verification = `${args.linkedLoop.verification.requestedMode}->${args.linkedLoop.verification.effectiveMode}`;

  return shorten([
    `Guidance ${args.report.alignment.status} with tracked dimensions ${args.trackedDimensions.join(", ") || "none"}.`,
    `Verdict: ${args.verdict}.`,
    improved.length > 0 ? `Improved: ${improved.join(", ")}.` : "Improved: none.",
    regressed.length > 0 ? `Regressed: ${regressed.join(", ")}.` : "Regressed: none.",
    stagnant.length > 0 ? `Stagnant weak: ${stagnant.join(", ")}.` : "Stagnant weak: none.",
    `Binding constraint ${args.bindingOutcome}.`,
    `Correction paths: ${paths}.`,
    `Verification ${verification}${args.floorEscalated ? " with scope floor escalation" : " without scope escalation"}.`,
  ].join(" "));
}

function buildItem(
  report: AuditGuidanceOutcomeReport,
  loops: AuditLoopReport[],
  outcomesById: Map<string, AuditOutcomeReport>,
  snapshotsById: Map<string, AiesDimension>,
): AuditGuidanceEffectivenessItem {
  const linkedLoop = chooseLinkedLoop(report, loops);
  const comparison = chooseOutcomeComparison(linkedLoop, outcomesById);
  const tracked = trackedDimensions(report);
  const effects = tracked.map((dimension) => ({
    dimension,
    outcome: targetDimensionOutcome(dimension, comparison),
  }));
  const bindingAfter = linkedLoop?.snapshotId ? snapshotsById.get(linkedLoop.snapshotId) ?? null : null;
  const requestedMode = linkedLoop?.verification.requestedMode ?? null;
  const scopeRecommendedMode = linkedLoop?.verification.scopeRecommendedMode ?? null;
  const effectiveMode = linkedLoop?.verification.effectiveMode ?? null;
  const floorEscalated = verificationModeRank(effectiveMode) > verificationModeRank(requestedMode);
  const bindingOutcome = bindingConstraintOutcome(report.guidance.bindingConstraint, bindingAfter);
  const verdict = summarizeVerdict({
    alignmentStatus: report.alignment.status,
    trackedDimensions: tracked,
    effects,
    bindingConstraintOutcome: bindingOutcome,
    linkedLoop,
  });

  return {
    guidanceOutcomeReportId: report.reportId,
    guidanceOutcomeGeneratedAt: report.generatedAt,
    sessionId: report.sessionId,
    runId: report.runId,
    relatedCycleId: report.relatedCycleId,
    relatedChangeId: report.relatedChangeId,
    guidanceSnapshotId: report.guidance.snapshotId,
    guidanceBindingConstraint: report.guidance.bindingConstraint,
    alignmentStatus: report.alignment.status,
    trackedDimensions: tracked,
    matchedTargetDimensions: [...report.alignment.matchedTargetDimensions],
    verification: {
      requestedMode,
      scopeRecommendedMode,
      effectiveMode,
      recordedMode: report.actual.verificationMode,
      recordedResult: report.actual.verificationResult,
      recordedState: report.actual.verificationState,
      floorEscalated,
    },
    linkedPostRunAudit: {
      loopId: linkedLoop?.loopId ?? null,
      loopGeneratedAt: linkedLoop?.generatedAt ?? null,
      snapshotId: linkedLoop?.snapshotId ?? null,
      outcomeReportId: linkedLoop?.outcomeReportId ?? null,
      bindingConstraintAfter: bindingAfter,
      bindingConstraintOutcome: bindingOutcome,
    },
    targetDimensionEffects: effects,
    correctionPathsObserved: comparison?.pathsObserved ?? [],
    correctionPathEvidence: comparison?.pathEvidence ?? [],
    verdict,
    summary: summarizeItem({
      report,
      trackedDimensions: tracked,
      effects,
      linkedLoop,
      comparison,
      verdict,
      bindingOutcome,
      floorEscalated,
    }),
  };
}

function reportSummary(items: AuditGuidanceEffectivenessItem[]): string {
  const verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number> = {
    supportive_signal: 0,
    counter_signal: 0,
    alternative_signal: 0,
    mixed_signal: 0,
    insufficient_evidence: 0,
  };

  let linkedPostRunAuditCount = 0;
  let floorEscalationCount = 0;
  for (const item of items) {
    verdictCounts[item.verdict] += 1;
    if (item.linkedPostRunAudit.loopId) {
      linkedPostRunAuditCount += 1;
    }
    if (item.verification.floorEscalated) {
      floorEscalationCount += 1;
    }
  }

  return [
    `Compared ${items.length} guidance outcome report${items.length === 1 ? "" : "s"}.`,
    `Linked post-run audits: ${linkedPostRunAuditCount}/${items.length || 1}.`,
    `Supportive signals: ${verdictCounts.supportive_signal}.`,
    `Counter signals: ${verdictCounts.counter_signal}.`,
    `Alternative signals: ${verdictCounts.alternative_signal}.`,
    `Mixed signals: ${verdictCounts.mixed_signal}.`,
    `Insufficient evidence: ${verdictCounts.insufficient_evidence}.`,
    `Scope-floor escalations: ${floorEscalationCount}.`,
  ].join(" ");
}

function isAuditGuidanceEffectivenessItem(value: unknown): value is AuditGuidanceEffectivenessItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceEffectivenessItem>;
  return typeof candidate.guidanceOutcomeReportId === "string"
    && typeof candidate.guidanceOutcomeGeneratedAt === "string"
    && typeof candidate.guidanceSnapshotId === "string"
    && typeof candidate.guidanceBindingConstraint === "string"
    && typeof candidate.alignmentStatus === "string"
    && Array.isArray(candidate.trackedDimensions)
    && Array.isArray(candidate.targetDimensionEffects)
    && typeof candidate.verdict === "string"
    && typeof candidate.summary === "string";
}

function isAuditGuidanceEffectivenessReport(value: unknown): value is AuditGuidanceEffectivenessReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceEffectivenessReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.guidanceOutcomeCount === "number"
    && typeof candidate.analyzedCount === "number"
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => isAuditGuidanceEffectivenessItem(item))
    && typeof candidate.summary === "string";
}

export function createAuditGuidanceEffectivenessReport(
  guidanceOutcomes = loadAuditGuidanceOutcomeHistory(0),
): AuditGuidanceEffectivenessReport | null {
  if (guidanceOutcomes.length === 0) {
    return null;
  }

  const loops = loadAuditLoopHistory(0);
  const outcomesById = new Map(loadAuditOutcomeReportHistory(0).map((report) => [report.reportId, report]));
  const snapshotsById = new Map(loadAuditSnapshotHistory(0).map((snapshot) => [snapshot.snapshotId, snapshot.bindingConstraint.dimension]));
  const items = guidanceOutcomes.map((report) => buildItem(report, loops, outcomesById, snapshotsById));
  const generatedAt = nowIso();
  const verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number> = {
    supportive_signal: 0,
    counter_signal: 0,
    alternative_signal: 0,
    mixed_signal: 0,
    insufficient_evidence: 0,
  };

  let linkedPostRunAuditCount = 0;
  let floorEscalationCount = 0;
  for (const item of items) {
    verdictCounts[item.verdict] += 1;
    if (item.linkedPostRunAudit.loopId) {
      linkedPostRunAuditCount += 1;
    }
    if (item.verification.floorEscalated) {
      floorEscalationCount += 1;
    }
  }

  return {
    reportId: createReportId(generatedAt),
    generatedAt,
    guidanceOutcomeCount: guidanceOutcomes.length,
    analyzedCount: items.length,
    linkedPostRunAuditCount,
    floorEscalationCount,
    verdictCounts,
    items,
    summary: reportSummary(items),
  };
}

export function persistAuditGuidanceEffectivenessReport(report: AuditGuidanceEffectivenessReport): string {
  const fullPath = join(ensureAuditGuidanceEffectivenessDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceEffectivenessHistory(limit = 10): AuditGuidanceEffectivenessReport[] {
  const directory = ensureAuditGuidanceEffectivenessDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceEffectivenessReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceEffectivenessReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceEffectivenessReport(): AuditGuidanceEffectivenessReport | null {
  return loadAuditGuidanceEffectivenessHistory(1)[0] ?? null;
}

export function formatAuditGuidanceEffectivenessReport(
  report: AuditGuidanceEffectivenessReport,
  itemLimit = 5,
): string {
  const items = report.items.slice(-itemLimit).reverse();
  const lines = [
    `Audit guidance effectiveness @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Summary: ${report.summary}`,
    `Verdicts: supportive=${report.verdictCounts.supportive_signal}, counter=${report.verdictCounts.counter_signal}, alternative=${report.verdictCounts.alternative_signal}, mixed=${report.verdictCounts.mixed_signal}, insufficient=${report.verdictCounts.insufficient_evidence}`,
  ];

  for (const item of items) {
    const effects = item.targetDimensionEffects.map((effect) => `${effect.dimension}:${effect.outcome}`).join(", ") || "none";
    lines.push("");
    lines.push(`${item.guidanceOutcomeReportId} => ${item.linkedPostRunAudit.snapshotId ?? "no-linked-audit"}`);
    lines.push(`Alignment: ${item.alignmentStatus}`);
    lines.push(`Tracked dimensions: ${item.trackedDimensions.join(", ") || "none"}`);
    lines.push(`Dimension effects: ${effects}`);
    lines.push(`Binding constraint outcome: ${item.linkedPostRunAudit.bindingConstraintOutcome}`);
    lines.push(`Correction paths: ${item.correctionPathsObserved.join(", ") || "none"}`);
    lines.push(`Verification floor: ${item.verification.requestedMode ?? "none"}->${item.verification.effectiveMode ?? item.verification.recordedMode ?? "none"}${item.verification.floorEscalated ? " (escalated)" : ""}`);
    lines.push(`Verdict: ${item.verdict}`);
    lines.push(`Detail: ${item.summary}`);
  }

  return lines.join("\n");
}
