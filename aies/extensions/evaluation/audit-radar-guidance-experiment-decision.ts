import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  createAuditGuidanceExperimentReport,
  type AuditGuidanceExperimentReport,
  type AuditGuidanceExperimentType,
} from "./audit-radar-guidance-experiment.ts";
import {
  createAuditGuidanceExperimentReviewReport,
  type AuditGuidanceExperimentExecutionStatus,
  type AuditGuidanceExperimentReviewReport,
  type AuditGuidanceExperimentSignal,
} from "./audit-radar-guidance-experiment-review.ts";
import type { AuditGuidanceLearningPosture } from "./audit-radar-guidance-learning.ts";

export type AuditGuidanceExperimentDecisionType =
  | "start_planned_experiment"
  | "continue_planned_experiment"
  | "fallback_to_baseline"
  | "reinforce_nonbaseline"
  | "hold_baseline"
  | "compare_again";

export interface AuditGuidanceExperimentDecisionReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  sourceExperimentReportId: string | null;
  sourceExperimentReportPath: string | null;
  sourceExperimentGeneratedAt: IsoTimestamp | null;
  sourceExperimentReviewReportId: string | null;
  sourceExperimentReviewReportPath: string | null;
  sourceExperimentReviewGeneratedAt: IsoTimestamp | null;
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  currentLearningPosture: AuditGuidanceLearningPosture;
  experimentType: AuditGuidanceExperimentType;
  experimentRecommendedPosture: AuditGuidanceLearningPosture;
  plannedRelevantCycles: number;
  observedRelevantCycles: number;
  analyzedRelevantCycles: number;
  executionStatus: AuditGuidanceExperimentExecutionStatus;
  signalDirection: AuditGuidanceExperimentSignal;
  decisionType: AuditGuidanceExperimentDecisionType;
  recommendedGuidancePosture: AuditGuidanceLearningPosture;
  summary: string;
  recommendationNote: string;
  rationale: string;
  guardrails: string[];
}

interface DecisionSource {
  experimentReport?: AuditGuidanceExperimentReport;
  experimentReportPath?: string | null;
  experimentReviewReport?: AuditGuidanceExperimentReviewReport | null;
  experimentReviewReportPath?: string | null;
}

interface DecisionPlan {
  decisionType: AuditGuidanceExperimentDecisionType;
  recommendedGuidancePosture: AuditGuidanceLearningPosture;
  summary: string;
  recommendationNote: string;
  rationale: string;
  guardrails: string[];
}

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(generatedAt: IsoTimestamp): string {
  return `audit-guidance-experiment-decision-${generatedAt.replace(/[:.]/g, "-")}`;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 280): string {
  const compact = normalize(text);
  if (!compact) {
    return "none";
  }

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function ensureAuditGuidanceExperimentDecisionDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceExperimentDecisionsRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

function normalizeReportFileName(report: AuditGuidanceExperimentDecisionReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function dimensionsLabel(bindingConstraint: AiesDimension, targetDimensions: AiesDimension[]): string {
  return targetDimensions.length > 0 ? targetDimensions.join(", ") : bindingConstraint;
}

function buildGuardrails(args: {
  decisionType: AuditGuidanceExperimentDecisionType;
  recommendedGuidancePosture: AuditGuidanceLearningPosture;
  plannedRelevantCycles: number;
  executionStatus: AuditGuidanceExperimentExecutionStatus;
  signalDirection: AuditGuidanceExperimentSignal;
}): string[] {
  const guards = [
    "Treat the decision as a bounded steering aid, not as proof of causality or a permanent policy rewrite.",
    "Keep the binding constraint and target dimensions fixed while evaluating whether the decision improved later guided outcomes.",
  ];

  if (args.decisionType === "start_planned_experiment" || args.decisionType === "continue_planned_experiment") {
    guards.push(`Do not declare the experiment settled until it reaches ${args.plannedRelevantCycles} relevant guided cycle${args.plannedRelevantCycles === 1 ? "" : "s"}.`);
  }

  if (args.decisionType === "fallback_to_baseline") {
    guards.push("Use baseline for the next relevant guided cycle and only retry a non-baseline posture after new supportive evidence appears.");
  }

  if (args.decisionType === "reinforce_nonbaseline") {
    guards.push(`Keep ${args.recommendedGuidancePosture} bounded; if later signals turn counter or mixed, fall back instead of escalating.`);
  }

  if (args.decisionType === "compare_again") {
    guards.push("Use baseline as the anchor for the next comparison instead of treating a mixed result as a non-baseline win.");
  }

  if (args.executionStatus === "completed" && args.signalDirection === "insufficient") {
    guards.push("A completed experiment without enough analyzed effectiveness evidence should trigger more observation, not stronger confidence.");
  }

  return guards;
}

function decidePlan(
  experiment: AuditGuidanceExperimentReport,
  review: AuditGuidanceExperimentReviewReport | null,
): DecisionPlan {
  const dimensions = dimensionsLabel(experiment.bindingConstraint, experiment.targetDimensions);
  const reviewed = review ?? createAuditGuidanceExperimentReviewReport(experiment);

  if (!reviewed || reviewed.observedRelevantCycles === 0) {
    return {
      decisionType: "start_planned_experiment",
      recommendedGuidancePosture: experiment.recommendedNextPosture,
      summary: experiment.recommendedNextPosture === "baseline"
        ? `No matching guided cycle has exercised the current ${experiment.experimentType} plan for ${dimensions} yet, so keep baseline as the bounded next posture and gather the first relevant execution evidence.`
        : `No matching guided cycle has exercised the current ${experiment.experimentType} plan for ${dimensions} yet, so start the bounded ${experiment.recommendedNextPosture} experiment instead of inventing a new posture shift.`,
      recommendationNote: experiment.recommendedNextPosture === "baseline"
        ? "Start with baseline and gather the first relevant experiment evidence."
        : `Start the planned ${experiment.recommendedNextPosture} experiment and keep the posture bounded until execution evidence appears.`,
      rationale: `The planner already narrowed the next posture for ${dimensions}, but no relevant execution evidence exists yet for that exact experiment signature, so the highest-coherence move is to start the planned experiment rather than rewrite it again.`,
      guardrails: buildGuardrails({
        decisionType: "start_planned_experiment",
        recommendedGuidancePosture: experiment.recommendedNextPosture,
        plannedRelevantCycles: experiment.plannedRelevantCycles,
        executionStatus: "not_started",
        signalDirection: "insufficient",
      }),
    };
  }

  if (reviewed.executionStatus === "in_progress") {
    if (reviewed.signalDirection === "counter" && reviewed.recommendedNextPosture !== "baseline") {
      return {
        decisionType: "fallback_to_baseline",
        recommendedGuidancePosture: "baseline",
        summary: `The ${reviewed.experimentType} experiment for ${dimensions} is still in progress, but its early signal is already counter to ${reviewed.recommendedNextPosture}, so fall back to baseline for the next relevant guided cycle instead of forcing completion blindly.`,
        recommendationNote: "Early counter-signal detected; reset to baseline for the next relevant guided cycle.",
        rationale: `The execution review shows a counter-signal before the bounded experiment completed, which is enough reason to use the planner's fallback guardrail rather than spending more cycles doubling down on the same non-baseline posture.`,
        guardrails: buildGuardrails({
          decisionType: "fallback_to_baseline",
          recommendedGuidancePosture: "baseline",
          plannedRelevantCycles: reviewed.plannedRelevantCycles,
          executionStatus: reviewed.executionStatus,
          signalDirection: reviewed.signalDirection,
        }),
      };
    }

    return {
      decisionType: "continue_planned_experiment",
      recommendedGuidancePosture: reviewed.recommendedNextPosture,
      summary: `The ${reviewed.experimentType} experiment for ${dimensions} is ${reviewed.executionStatus} at ${reviewed.observedRelevantCycles}/${reviewed.plannedRelevantCycles} relevant guided cycles, so continue the same bounded posture until the planned sample is complete instead of replanning early.`,
      recommendationNote: `Continue ${reviewed.recommendedNextPosture} until the bounded experiment reaches its planned relevant cycle count.`,
      rationale: `Execution evidence now exists, but the experiment has not yet reached its planned sample. Changing posture again now would collapse planning, execution, and evaluation back into one noisy loop.`,
      guardrails: buildGuardrails({
        decisionType: "continue_planned_experiment",
        recommendedGuidancePosture: reviewed.recommendedNextPosture,
        plannedRelevantCycles: reviewed.plannedRelevantCycles,
        executionStatus: reviewed.executionStatus,
        signalDirection: reviewed.signalDirection,
      }),
    };
  }

  if (reviewed.signalDirection === "supportive") {
    if (reviewed.recommendedNextPosture === "baseline") {
      return {
        decisionType: "hold_baseline",
        recommendedGuidancePosture: "baseline",
        summary: `The completed ${reviewed.experimentType} run for ${dimensions} supports staying baseline, so keep baseline as the next posture until a non-baseline option earns a clearer constructive edge.`,
        recommendationNote: "Completed evidence supports baseline; keep it as the next bounded posture.",
        rationale: `A completed experiment that still supports baseline is useful evidence, not stagnation. It means the system has a measured anchor instead of a guessed default.`,
        guardrails: buildGuardrails({
          decisionType: "hold_baseline",
          recommendedGuidancePosture: "baseline",
          plannedRelevantCycles: reviewed.plannedRelevantCycles,
          executionStatus: reviewed.executionStatus,
          signalDirection: reviewed.signalDirection,
        }),
      };
    }

    return {
      decisionType: "reinforce_nonbaseline",
      recommendedGuidancePosture: reviewed.recommendedNextPosture,
      summary: `The completed ${reviewed.experimentType} experiment for ${dimensions} produced a supportive signal, so let future guidance keep ${reviewed.recommendedNextPosture} as the next bounded posture instead of resetting immediately to baseline.`,
      recommendationNote: `Completed evidence is supportive; reinforce ${reviewed.recommendedNextPosture} as the next bounded posture.`,
      rationale: `The experiment reached completion and its linked signals lean constructive, which is enough to reinforce the same non-baseline posture for the next bounded cycle window without pretending the posture is now permanently proven.`,
      guardrails: buildGuardrails({
        decisionType: "reinforce_nonbaseline",
        recommendedGuidancePosture: reviewed.recommendedNextPosture,
        plannedRelevantCycles: reviewed.plannedRelevantCycles,
        executionStatus: reviewed.executionStatus,
        signalDirection: reviewed.signalDirection,
      }),
    };
  }

  if (reviewed.signalDirection === "counter") {
    return {
      decisionType: "fallback_to_baseline",
      recommendedGuidancePosture: "baseline",
      summary: `The completed ${reviewed.experimentType} experiment for ${dimensions} ended with a counter-signal, so reset future guidance to baseline before proposing another non-baseline probe.`,
      recommendationNote: "Completed evidence is counter-signaling; reset future guidance to baseline.",
      rationale: `Once the bounded experiment completed with counter-signals, staying on the same non-baseline posture would ignore the exact evidence the experiment was supposed to gather.`,
      guardrails: buildGuardrails({
        decisionType: "fallback_to_baseline",
        recommendedGuidancePosture: "baseline",
        plannedRelevantCycles: reviewed.plannedRelevantCycles,
        executionStatus: reviewed.executionStatus,
        signalDirection: reviewed.signalDirection,
      }),
    };
  }

  if (reviewed.recommendedNextPosture === "baseline") {
    return {
      decisionType: "hold_baseline",
      recommendedGuidancePosture: "baseline",
      summary: `The completed ${reviewed.experimentType} evidence for ${dimensions} is ${reviewed.signalDirection}, so keep baseline as the anchor posture until a clearer non-baseline signal appears.`,
      recommendationNote: "Hold baseline as the anchor posture while the evidence stays mixed or thin.",
      rationale: `Mixed or insufficient completed evidence should not trigger a stronger posture change. Baseline remains the safest anchor when the experiment does not clearly justify a non-baseline winner.`,
      guardrails: buildGuardrails({
        decisionType: "hold_baseline",
        recommendedGuidancePosture: "baseline",
        plannedRelevantCycles: reviewed.plannedRelevantCycles,
        executionStatus: reviewed.executionStatus,
        signalDirection: reviewed.signalDirection,
      }),
    };
  }

  return {
    decisionType: "compare_again",
    recommendedGuidancePosture: "baseline",
    summary: `The completed ${reviewed.experimentType} experiment for ${dimensions} ended with ${reviewed.signalDirection} evidence, so use baseline as the next anchor and compare again explicitly instead of treating the prior non-baseline posture as settled policy.`,
    recommendationNote: "Completed evidence is mixed or thin; compare again from a baseline anchor instead of reinforcing the prior non-baseline posture.",
    rationale: `A bounded experiment that finishes without a supportive lead should still steer guidance, but toward a more controlled comparison rather than toward unearned confidence in the last non-baseline posture.`,
    guardrails: buildGuardrails({
      decisionType: "compare_again",
      recommendedGuidancePosture: "baseline",
      plannedRelevantCycles: reviewed.plannedRelevantCycles,
      executionStatus: reviewed.executionStatus,
      signalDirection: reviewed.signalDirection,
    }),
  };
}

function isAuditGuidanceExperimentDecisionReport(value: unknown): value is AuditGuidanceExperimentDecisionReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceExperimentDecisionReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.bindingConstraint === "string"
    && Array.isArray(candidate.targetDimensions)
    && typeof candidate.experimentType === "string"
    && typeof candidate.experimentRecommendedPosture === "string"
    && typeof candidate.decisionType === "string"
    && typeof candidate.recommendedGuidancePosture === "string"
    && typeof candidate.summary === "string"
    && typeof candidate.recommendationNote === "string"
    && typeof candidate.rationale === "string"
    && Array.isArray(candidate.guardrails);
}

export function createAuditGuidanceExperimentDecisionReport(
  bindingConstraint: AiesDimension,
  targetDimensions: AiesDimension[],
  source: DecisionSource = {},
): AuditGuidanceExperimentDecisionReport {
  const experiment = source.experimentReport ?? createAuditGuidanceExperimentReport(bindingConstraint, targetDimensions);
  const review = source.experimentReviewReport ?? createAuditGuidanceExperimentReviewReport(experiment);
  const plan = decidePlan(experiment, review);
  const generatedAt = nowIso();

  return {
    reportId: createReportId(generatedAt),
    generatedAt,
    sourceExperimentReportId: experiment.reportId,
    sourceExperimentReportPath: source.experimentReportPath ?? null,
    sourceExperimentGeneratedAt: experiment.generatedAt,
    sourceExperimentReviewReportId: review?.reportId ?? null,
    sourceExperimentReviewReportPath: source.experimentReviewReportPath ?? null,
    sourceExperimentReviewGeneratedAt: review?.generatedAt ?? null,
    bindingConstraint: experiment.bindingConstraint,
    targetDimensions: [...experiment.targetDimensions],
    currentLearningPosture: experiment.currentLearningPosture,
    experimentType: experiment.experimentType,
    experimentRecommendedPosture: experiment.recommendedNextPosture,
    plannedRelevantCycles: experiment.plannedRelevantCycles,
    observedRelevantCycles: review?.observedRelevantCycles ?? 0,
    analyzedRelevantCycles: review?.analyzedRelevantCycles ?? 0,
    executionStatus: review?.executionStatus ?? "not_started",
    signalDirection: review?.signalDirection ?? "insufficient",
    decisionType: plan.decisionType,
    recommendedGuidancePosture: plan.recommendedGuidancePosture,
    summary: shorten(plan.summary),
    recommendationNote: shorten(plan.recommendationNote, 220),
    rationale: shorten(plan.rationale, 340),
    guardrails: plan.guardrails.map((item) => shorten(item, 220)),
  };
}

export function persistAuditGuidanceExperimentDecisionReport(report: AuditGuidanceExperimentDecisionReport): string {
  const fullPath = join(ensureAuditGuidanceExperimentDecisionDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceExperimentDecisionHistory(limit = 10): AuditGuidanceExperimentDecisionReport[] {
  const directory = ensureAuditGuidanceExperimentDecisionDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceExperimentDecisionReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceExperimentDecisionReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceExperimentDecisionReport(): AuditGuidanceExperimentDecisionReport | null {
  return loadAuditGuidanceExperimentDecisionHistory(1)[0] ?? null;
}

export function latestAuditGuidanceExperimentDecisionReportPath(): string | null {
  const root = getAiesPaths().auditRadarGuidanceExperimentDecisionsRoot;
  if (!existsSync(root)) {
    return null;
  }

  const candidate = readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return candidate ? projectRelativePath(join(root, candidate)) : null;
}

export function formatAuditGuidanceExperimentDecisionReport(report: AuditGuidanceExperimentDecisionReport): string {
  return [
    `Audit guidance experiment decision @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Binding constraint: ${report.bindingConstraint}`,
    `Target dimensions: ${report.targetDimensions.join(", ") || "none"}`,
    `Current learning posture: ${report.currentLearningPosture}`,
    `Experiment: ${report.experimentType} -> ${report.experimentRecommendedPosture}`,
    `Experiment report: ${report.sourceExperimentReportPath ?? report.sourceExperimentReportId ?? "none"}`,
    `Experiment review: ${report.sourceExperimentReviewReportPath ?? report.sourceExperimentReviewReportId ?? "none"}`,
    `Observed relevant cycles: ${report.observedRelevantCycles}/${report.plannedRelevantCycles}`,
    `Analyzed relevant cycles: ${report.analyzedRelevantCycles}`,
    `Execution status: ${report.executionStatus}`,
    `Signal direction: ${report.signalDirection}`,
    `Decision type: ${report.decisionType}`,
    `Recommended guidance posture: ${report.recommendedGuidancePosture}`,
    `Summary: ${report.summary}`,
    `Recommendation: ${report.recommendationNote}`,
    `Rationale: ${report.rationale}`,
    `Guardrails: ${report.guardrails.join(" | ") || "none"}`,
  ].join("\n");
}
