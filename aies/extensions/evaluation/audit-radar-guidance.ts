import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesAuditRecommendedActionType, LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";
import type { AiesDimension, FocusType, IsoTimestamp } from "../../contracts/primitives.ts";
import type { AuditLoopReport } from "./audit-radar-loop.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { latestAuditSnapshot } from "./audit-radar-state.ts";
import {
  createAuditGuidanceLearningPolicy,
  type AuditGuidanceLearningPosture,
} from "./audit-radar-guidance-learning.ts";
import {
  createAuditGuidanceExperimentReport,
  latestAuditGuidanceExperimentReportPath,
  type AuditGuidanceExperimentType,
} from "./audit-radar-guidance-experiment.ts";
import {
  createAuditGuidanceExperimentDecisionReport,
  latestAuditGuidanceExperimentDecisionReportPath,
  type AuditGuidanceExperimentDecisionType,
} from "./audit-radar-guidance-experiment-decision.ts";

export interface AuditRadarGuidance {
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
  learningPosture: AuditGuidanceLearningPosture;
  learningSummary: string;
  learningRecommendation: string;
  learningRelevantItemCount: number;
  learningReportGeneratedAt: IsoTimestamp | null;
  learningReportPath: string | null;
  experimentType: AuditGuidanceExperimentType;
  experimentNextPosture: AuditGuidanceLearningPosture;
  experimentSummary: string;
  experimentPlannedRelevantCycles: number;
  experimentReportGeneratedAt: IsoTimestamp | null;
  experimentReportPath: string | null;
  experimentDecisionType: AuditGuidanceExperimentDecisionType;
  experimentDecisionPosture: AuditGuidanceLearningPosture;
  experimentDecisionSummary: string;
  experimentDecisionRecommendation: string;
  experimentDecisionReportGeneratedAt: IsoTimestamp | null;
  experimentDecisionReportPath: string | null;
}

function compact(text: string | null | undefined, maxLength = 220): string {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "none";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function listOrNone(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "none";
}

function latestLoopReportPath(): string | null {
  const root = getAiesPaths().auditRadarLoopsRoot;
  if (!existsSync(root)) {
    return null;
  }

  const candidate = readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return candidate ? join(root, candidate) : null;
}

function readLatestLoopReport(): { report: Partial<AuditLoopReport>; relativePath: string } | null {
  const filePath = latestLoopReportPath();
  if (!filePath) {
    return null;
  }

  try {
    const report = JSON.parse(readFileSync(filePath, "utf8")) as Partial<AuditLoopReport>;
    return {
      report,
      relativePath: relative(getAiesPaths().projectRoot, filePath).replace(/\\/g, "/"),
    };
  } catch {
    return null;
  }
}

function mapActionTypeToFocus(actionType: AiesAuditRecommendedActionType, activeChangeId: string | null): FocusType {
  if (activeChangeId) {
    return "active_change_continuation";
  }

  switch (actionType) {
    case "tool":
      return "tool_creation";
    case "extension":
      return "capability_expansion";
    case "theory_experiment":
      return "theory_experiment";
    case "memory_update":
      return "memory_theory_consolidation";
    case "openspec_change":
      return "architecture_simplification";
    default:
      return "capability_expansion";
  }
}

function actionLabel(actionType: AiesAuditRecommendedActionType, continueActiveChange: boolean): string {
  switch (actionType) {
    case "tool":
      return continueActiveChange ? "tool-backed implementation step" : "tool-creation step";
    case "extension":
      return "capability-expansion step";
    case "theory_experiment":
      return "theory experiment";
    case "memory_update":
      return "memory/theory consolidation step";
    case "openspec_change":
      return continueActiveChange ? "OpenSpec-backed continuation step" : "new OpenSpec proposal";
    case "operator_request":
      return "operator-supported unblock";
    default:
      return "next evolution step";
  }
}

function latestLoopVerification(report: Partial<AuditLoopReport> | null): string {
  const requestedMode = typeof report?.verification?.requestedMode === "string" ? report.verification.requestedMode : null;
  const result = typeof report?.verification?.result === "string" ? report.verification.result : null;
  return requestedMode && result ? `${requestedMode}/${result}` : "none";
}

function learningSummaryClause(posture: AuditGuidanceLearningPosture, recommendation: string): string | null {
  if (posture === "baseline") {
    return null;
  }

  return recommendation;
}

function experimentSummaryClause(
  experimentType: AuditGuidanceExperimentType,
  experimentSummary: string,
): string | null {
  if (experimentType === "hold_baseline") {
    return null;
  }

  return experimentSummary;
}

function experimentDecisionClause(
  decisionType: AuditGuidanceExperimentDecisionType,
  summary: string,
): string | null {
  if (decisionType === "start_planned_experiment") {
    return null;
  }

  return summary;
}

export function createAuditRadarGuidance(snapshot: LayerAuditSnapshot, activeChangeId: string | null): AuditRadarGuidance {
  const latestLoop = readLatestLoopReport();
  const continueActiveChange = Boolean(activeChangeId);
  const recommendedFocusType = mapActionTypeToFocus(snapshot.recommendedNextStep.actionType, activeChangeId);
  const targetDimensions = snapshot.recommendedNextStep.targetDimensions;
  const suggestedPaths = snapshot.recommendedNextStep.suggestedPaths;
  const learningPolicy = createAuditGuidanceLearningPolicy(snapshot.bindingConstraint.dimension, targetDimensions);
  const experimentPlan = createAuditGuidanceExperimentReport(snapshot.bindingConstraint.dimension, targetDimensions);
  const experimentDecision = createAuditGuidanceExperimentDecisionReport(snapshot.bindingConstraint.dimension, targetDimensions, {
    experimentReport: experimentPlan,
  });
  const experimentReportPath = latestAuditGuidanceExperimentReportPath();
  const experimentDecisionReportPath = latestAuditGuidanceExperimentDecisionReportPath();
  const baseSummary = continueActiveChange
    ? `Continue ${activeChangeId} with a ${actionLabel(snapshot.recommendedNextStep.actionType, true)} aimed at ${listOrNone(targetDimensions)}.`
    : `Use the latest audit to choose a ${actionLabel(snapshot.recommendedNextStep.actionType, false)} aimed at ${listOrNone(targetDimensions)}.`;
  const summary = compact([
    baseSummary,
    learningSummaryClause(learningPolicy.posture, learningPolicy.recommendationNote),
    experimentDecisionClause(experimentDecision.decisionType, experimentDecision.summary)
      ?? experimentSummaryClause(experimentPlan.experimentType, experimentPlan.summary),
  ].filter((item): item is string => Boolean(item)).join(" "));

  const rationaleParts = [
    `Binding constraint: ${snapshot.bindingConstraint.dimension}.`,
    snapshot.drift?.maintenanceLoopRisk ? "Maintenance-loop risk is active, so prefer a reusable capability step over passive maintenance." : null,
    snapshot.drift && snapshot.drift.repeatedBindingConstraintCount > 1
      ? `Binding constraint streak: ${snapshot.bindingConstraint.dimension} x${snapshot.drift.repeatedBindingConstraintCount}.`
      : null,
    compact(snapshot.recommendedNextStep.rationale),
    `Guidance learning (${learningPolicy.posture}): ${learningPolicy.summary}`,
    `Guidance experiment (${experimentPlan.experimentType} -> ${experimentPlan.recommendedNextPosture}): ${experimentPlan.summary}`,
    `Guidance experiment decision (${experimentDecision.decisionType} -> ${experimentDecision.recommendedGuidancePosture}): ${experimentDecision.summary}`,
    latestLoop
      ? `Latest audit-loop evidence: ${latestLoop.report.orchestrationSource ?? "unknown"} with ${latestLoopVerification(latestLoop.report)} @ ${latestLoop.report.generatedAt ?? "unknown"}.`
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    snapshotId: snapshot.snapshotId,
    observedAt: snapshot.observedAt,
    activeChangeId,
    continueActiveChange,
    recommendedFocusType,
    actionType: snapshot.recommendedNextStep.actionType,
    bindingConstraint: snapshot.bindingConstraint.dimension,
    targetDimensions,
    suggestedPaths,
    summary,
    rationale: rationaleParts.join(" "),
    driftSummary: compact(snapshot.drift?.summary ?? "none"),
    latestLoopGeneratedAt: typeof latestLoop?.report.generatedAt === "string" ? latestLoop.report.generatedAt : null,
    latestLoopSource: typeof latestLoop?.report.orchestrationSource === "string" ? latestLoop.report.orchestrationSource : null,
    latestLoopVerification: latestLoopVerification(latestLoop?.report ?? null),
    latestLoopReportPath: latestLoop?.relativePath ?? null,
    learningPosture: learningPolicy.posture,
    learningSummary: learningPolicy.summary,
    learningRecommendation: learningPolicy.recommendationNote,
    learningRelevantItemCount: learningPolicy.relevantItemCount,
    learningReportGeneratedAt: learningPolicy.reportGeneratedAt,
    learningReportPath: learningPolicy.reportPath,
    experimentType: experimentPlan.experimentType,
    experimentNextPosture: experimentPlan.recommendedNextPosture,
    experimentSummary: experimentPlan.summary,
    experimentPlannedRelevantCycles: experimentPlan.plannedRelevantCycles,
    experimentReportGeneratedAt: experimentPlan.generatedAt,
    experimentReportPath,
    experimentDecisionType: experimentDecision.decisionType,
    experimentDecisionPosture: experimentDecision.recommendedGuidancePosture,
    experimentDecisionSummary: experimentDecision.summary,
    experimentDecisionRecommendation: experimentDecision.recommendationNote,
    experimentDecisionReportGeneratedAt: experimentDecision.generatedAt,
    experimentDecisionReportPath,
  };
}

export function latestAuditRadarGuidance(activeChangeId: string | null): AuditRadarGuidance | null {
  const snapshot = latestAuditSnapshot();
  return snapshot ? createAuditRadarGuidance(snapshot, activeChangeId) : null;
}

export function formatAuditRadarGuidance(guidance: AuditRadarGuidance): string {
  return [
    `Audit guidance snapshot: ${guidance.snapshotId}`,
    `Observed: ${guidance.observedAt}`,
    `Summary: ${guidance.summary}`,
    `Recommended focus type: ${guidance.recommendedFocusType}`,
    `Action type: ${guidance.actionType}`,
    `Binding constraint: ${guidance.bindingConstraint}`,
    `Target dimensions: ${listOrNone(guidance.targetDimensions)}`,
    `Suggested paths: ${listOrNone(guidance.suggestedPaths)}`,
    `Drift pressure: ${guidance.driftSummary}`,
    `Learning posture: ${guidance.learningPosture}`,
    `Learning signal: ${guidance.learningSummary}`,
    `Learning recommendation: ${guidance.learningRecommendation}`,
    `Learning report: ${guidance.learningReportPath ?? "none"}`,
    `Experiment plan: ${guidance.experimentType} -> ${guidance.experimentNextPosture}`,
    `Experiment summary: ${guidance.experimentSummary}`,
    `Experiment report: ${guidance.experimentReportPath ?? "none"}`,
    `Experiment decision: ${guidance.experimentDecisionType} -> ${guidance.experimentDecisionPosture}`,
    `Experiment decision summary: ${guidance.experimentDecisionSummary}`,
    `Experiment decision recommendation: ${guidance.experimentDecisionRecommendation}`,
    `Experiment decision report: ${guidance.experimentDecisionReportPath ?? "none"}`,
    `Latest loop evidence: ${guidance.latestLoopSource ?? "none"} · ${guidance.latestLoopVerification} · ${guidance.latestLoopGeneratedAt ?? "none"}`,
    `Latest loop report: ${guidance.latestLoopReportPath ?? "none"}`,
    `Rationale: ${guidance.rationale}`,
  ].join("\n");
}

export function buildAuditRadarGuidancePromptBlock(guidance: AuditRadarGuidance): string {
  return [
    "AIES AUDIT GUIDANCE",
    `Execution summary: ${guidance.summary}`,
    `Recommended focus type: ${guidance.recommendedFocusType}`,
    `Action type: ${guidance.actionType}`,
    `Binding constraint: ${guidance.bindingConstraint}`,
    `Target dimensions: ${listOrNone(guidance.targetDimensions)}`,
    `Suggested paths: ${listOrNone(guidance.suggestedPaths)}`,
    `Drift pressure: ${guidance.driftSummary}`,
    `Learning posture: ${guidance.learningPosture}`,
    `Learning signal: ${guidance.learningSummary}`,
    `Learning recommendation: ${guidance.learningRecommendation}`,
    `Experiment plan: ${guidance.experimentType} -> ${guidance.experimentNextPosture}`,
    `Experiment summary: ${guidance.experimentSummary}`,
    `Experiment decision: ${guidance.experimentDecisionType} -> ${guidance.experimentDecisionPosture}`,
    `Experiment decision summary: ${guidance.experimentDecisionSummary}`,
    `Experiment decision recommendation: ${guidance.experimentDecisionRecommendation}`,
    `Latest loop evidence: ${guidance.latestLoopSource ?? "none"} · ${guidance.latestLoopVerification}`,
    `Why now: ${guidance.rationale}`,
    "Use this as a judgment aid for the next step. Prefer continuing the active change when justified, but explain any stronger reason to diverge.",
  ].join("\n");
}
