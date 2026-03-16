import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  createAuditGuidanceLearningPolicy,
  type AuditGuidanceLearningPolicy,
  type AuditGuidanceLearningPosture,
} from "./audit-radar-guidance-learning.ts";
import {
  latestAuditGuidanceLearningReviewReport,
  type AuditGuidanceLearningReviewBucket,
  type AuditGuidanceLearningReviewReport,
} from "./audit-radar-guidance-learning-review.ts";

export type AuditGuidanceExperimentType =
  | "hold_baseline"
  | "probe_nonbaseline"
  | "reinforce_nonbaseline"
  | "reset_to_baseline"
  | "compare_mixed";

export interface AuditGuidanceExperimentReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  currentLearningPosture: AuditGuidanceLearningPosture;
  recommendedNextPosture: AuditGuidanceLearningPosture;
  experimentType: AuditGuidanceExperimentType;
  plannedRelevantCycles: number;
  reviewConfidence: "none" | "anecdotal" | "bounded";
  learningRelevantItemCount: number;
  learningReviewGeneratedAt: IsoTimestamp | null;
  learningReviewPath: string | null;
  strongestReviewedPosture: AuditGuidanceLearningPosture | null;
  weakestReviewedPosture: AuditGuidanceLearningPosture | null;
  baselineConstructiveRate: number | null;
  summary: string;
  rationale: string;
  guardrails: string[];
}

const REVIEW_COMPARABLE_MIN = 2;

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(generatedAt: IsoTimestamp): string {
  return `audit-guidance-experiment-${generatedAt.replace(/[:.]/g, "-")}`;
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

function latestGuidanceExperimentReportPath(): string | null {
  const root = getAiesPaths().auditRadarGuidanceExperimentsRoot;
  if (!existsSync(root)) {
    return null;
  }

  const candidate = readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return candidate ? projectRelativePath(join(root, candidate)) : null;
}

function latestGuidanceLearningReviewPath(): string | null {
  const root = getAiesPaths().auditRadarGuidanceLearningReviewRoot;
  if (!existsSync(root)) {
    return null;
  }

  const candidate = readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return candidate ? projectRelativePath(join(root, candidate)) : null;
}

function normalizeReportFileName(report: AuditGuidanceExperimentReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function ensureAuditGuidanceExperimentDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceExperimentsRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

function describeDimensions(bindingConstraint: AiesDimension, targetDimensions: AiesDimension[]): string {
  return targetDimensions.length > 0 ? targetDimensions.join(", ") : bindingConstraint;
}

function constructiveRate(bucket: AuditGuidanceLearningReviewBucket | null | undefined): number | null {
  if (!bucket || bucket.itemCount === 0) {
    return null;
  }

  return bucket.constructiveSignalCount / bucket.itemCount;
}

function bucketScore(bucket: AuditGuidanceLearningReviewBucket | null | undefined): number | null {
  if (!bucket || bucket.itemCount === 0) {
    return null;
  }

  return (bucket.constructiveSignalCount - bucket.adverseSignalCount) / bucket.itemCount;
}

function comparableBuckets(report: AuditGuidanceLearningReviewReport | null): AuditGuidanceLearningReviewBucket[] {
  if (!report) {
    return [];
  }

  return report.buckets.filter((bucket) => bucket.itemCount >= REVIEW_COMPARABLE_MIN);
}

function reviewConfidence(report: AuditGuidanceLearningReviewReport | null): "none" | "anecdotal" | "bounded" {
  if (!report) {
    return "none";
  }

  return comparableBuckets(report).length > 0 ? "bounded" : "anecdotal";
}

function findBucket(
  report: AuditGuidanceLearningReviewReport | null,
  posture: AuditGuidanceLearningPosture | null | undefined,
): AuditGuidanceLearningReviewBucket | null {
  if (!report || !posture) {
    return null;
  }

  return report.buckets.find((bucket) => bucket.posture === posture) ?? null;
}

function buildGuardrails(args: {
  experimentType: AuditGuidanceExperimentType;
  recommendedNextPosture: AuditGuidanceLearningPosture;
  plannedRelevantCycles: number;
}): string[] {
  const guards = [
    "Treat the posture recommendation as a bounded experiment, not as a hard policy rewrite.",
    "Keep the binding constraint and target dimensions fixed while evaluating the posture shift.",
    `Re-run posture review after ${args.plannedRelevantCycles} more relevant guided cycle${args.plannedRelevantCycles === 1 ? "" : "s"}, or sooner if the binding constraint changes.`,
  ];

  if (args.experimentType === "probe_nonbaseline" || args.experimentType === "compare_mixed") {
    guards.push(`If ${args.recommendedNextPosture} keeps producing counter-signals, fall back to baseline instead of escalating further.`);
  }

  if (args.experimentType === "reinforce_nonbaseline") {
    guards.push(`Stay willing to fall back to baseline if ${args.recommendedNextPosture} loses its constructive edge over baseline.`);
  }

  return guards;
}

function planFromSignals(args: {
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  learningPolicy: AuditGuidanceLearningPolicy;
  learningReview: AuditGuidanceLearningReviewReport | null;
}): Pick<AuditGuidanceExperimentReport, "recommendedNextPosture" | "experimentType" | "plannedRelevantCycles" | "summary" | "rationale"> {
  const dimensions = describeDimensions(args.bindingConstraint, args.targetDimensions);
  const comparable = comparableBuckets(args.learningReview);
  const strongestBucket = findBucket(args.learningReview, args.learningReview?.strongestPosture ?? null);
  const weakestBucket = findBucket(args.learningReview, args.learningReview?.weakestPosture ?? null);
  const baselineBucket = findBucket(args.learningReview, "baseline");
  const currentBucket = findBucket(args.learningReview, args.learningPolicy.posture);
  const strongestRate = constructiveRate(strongestBucket);
  const baselineRate = args.learningReview?.baselineConstructiveRate ?? constructiveRate(baselineBucket);
  const currentScore = bucketScore(currentBucket);
  const baselineScore = bucketScore(baselineBucket);

  if (!args.learningReview) {
    return {
      recommendedNextPosture: args.learningPolicy.posture,
      experimentType: args.learningPolicy.posture === "baseline" ? "hold_baseline" : "probe_nonbaseline",
      plannedRelevantCycles: args.learningPolicy.posture === "baseline" ? 2 : 1,
      summary: args.learningPolicy.posture === "baseline"
        ? `No durable posture review exists yet for ${dimensions}, so stay baseline and gather more relevant guided evidence before experimenting.`
        : `No durable posture review exists yet for ${dimensions}, so run one bounded ${args.learningPolicy.posture} probe and then review its downstream signals.`,
      rationale: args.learningPolicy.posture === "baseline"
        ? `There is not yet a posture-level review surface with repeated evidence for ${dimensions}, so baseline remains the least assumptive default.`
        : `The current learning policy already leans ${args.learningPolicy.posture}, but the posture review is still absent, so the safest next move is one bounded probe rather than a hard shift.`,
    };
  }

  if (comparable.length === 0) {
    return {
      recommendedNextPosture: args.learningPolicy.posture,
      experimentType: args.learningPolicy.posture === "baseline" ? "hold_baseline" : "probe_nonbaseline",
      plannedRelevantCycles: args.learningPolicy.posture === "baseline" ? 2 : 1,
      summary: args.learningPolicy.posture === "baseline"
        ? `Posture review for ${dimensions} is still anecdotal, so keep baseline and collect repeated relevant guided history before preferring a non-baseline posture.`
        : `Posture review for ${dimensions} is still anecdotal, so probe ${args.learningPolicy.posture} for one more relevant guided cycle and then compare it against baseline again.`,
      rationale: args.learningPolicy.posture === "baseline"
        ? `The learning review exists but does not yet contain repeated posture evidence, so baseline remains the bounded default.`
        : `The learning policy sees a non-baseline lean, but the posture review is still sample-thin, so one bounded probe is safer than treating the posture as proven.`,
    };
  }

  if (
    strongestBucket
    && strongestBucket.posture !== "baseline"
    && strongestRate !== null
    && baselineRate !== null
    && strongestRate > baselineRate
  ) {
    return {
      recommendedNextPosture: strongestBucket.posture,
      experimentType: "reinforce_nonbaseline",
      plannedRelevantCycles: 2,
      summary: `${strongestBucket.posture} currently outperforms baseline for ${dimensions}, so keep that posture for the next two relevant guided cycles and then re-review whether the advantage persists.`,
      rationale: `${strongestBucket.posture} has the strongest bounded posture review so far (${Math.round(strongestRate * 100)}% constructive vs ${Math.round(baselineRate * 100)}% for baseline), which is enough to justify a bounded reinforcement experiment but not a permanent policy switch.`,
    };
  }

  if (
    args.learningPolicy.posture !== "baseline"
    && weakestBucket?.posture === args.learningPolicy.posture
    && currentScore !== null
    && baselineScore !== null
    && currentScore < baselineScore
  ) {
    return {
      recommendedNextPosture: "baseline",
      experimentType: "reset_to_baseline",
      plannedRelevantCycles: 1,
      summary: `${args.learningPolicy.posture} is currently the weakest reviewed posture for ${dimensions}, so reset to baseline for the next relevant guided cycle before trusting another non-baseline shift.`,
      rationale: `The posture review currently rates ${args.learningPolicy.posture} below baseline on constructive versus adverse balance, so the bounded response is to reset rather than double down.`,
    };
  }

  if (args.learningPolicy.posture === "mixed") {
    return {
      recommendedNextPosture: "baseline",
      experimentType: "compare_mixed",
      plannedRelevantCycles: 2,
      summary: `Posture evidence for ${dimensions} is mixed, so keep baseline as the anchor and compare future relevant guided cycles explicitly instead of trusting the current lean.`,
      rationale: `The review contains repeated evidence, but it does not yet support one stable non-baseline leader strongly enough to justify a confident shift.`,
    };
  }

  if (args.learningPolicy.posture !== "baseline") {
    return {
      recommendedNextPosture: args.learningPolicy.posture,
      experimentType: "compare_mixed",
      plannedRelevantCycles: 1,
      summary: `${args.learningPolicy.posture} remains plausible for ${dimensions}, but the posture evidence is still mixed enough that the next guided cycle should be treated as an explicit comparison run rather than as settled policy.`,
      rationale: `The current learning posture has not clearly beaten baseline, but it has not failed decisively either, so one more bounded comparison is a better experiment than either blind reinforcement or immediate reset.`,
    };
  }

  return {
    recommendedNextPosture: "baseline",
    experimentType: "hold_baseline",
    plannedRelevantCycles: 2,
    summary: `Baseline remains the most defensible posture for ${dimensions} until a non-baseline option accumulates a clearer constructive edge.`,
    rationale: `Repeated posture evidence now exists, but no non-baseline posture currently justifies a stronger shift than baseline.`,
  };
}

function isAuditGuidanceExperimentReport(value: unknown): value is AuditGuidanceExperimentReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceExperimentReport>;
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
    && Array.isArray(candidate.guardrails);
}

export function createAuditGuidanceExperimentReport(
  bindingConstraint: AiesDimension,
  targetDimensions: AiesDimension[],
): AuditGuidanceExperimentReport {
  const learningPolicy = createAuditGuidanceLearningPolicy(bindingConstraint, targetDimensions);
  const learningReview = latestAuditGuidanceLearningReviewReport();
  const plan = planFromSignals({
    bindingConstraint,
    targetDimensions,
    learningPolicy,
    learningReview,
  });
  const generatedAt = nowIso();

  return {
    reportId: createReportId(generatedAt),
    generatedAt,
    bindingConstraint,
    targetDimensions: [...targetDimensions],
    currentLearningPosture: learningPolicy.posture,
    recommendedNextPosture: plan.recommendedNextPosture,
    experimentType: plan.experimentType,
    plannedRelevantCycles: plan.plannedRelevantCycles,
    reviewConfidence: reviewConfidence(learningReview),
    learningRelevantItemCount: learningPolicy.relevantItemCount,
    learningReviewGeneratedAt: learningReview?.generatedAt ?? null,
    learningReviewPath: latestGuidanceLearningReviewPath(),
    strongestReviewedPosture: learningReview?.strongestPosture ?? null,
    weakestReviewedPosture: learningReview?.weakestPosture ?? null,
    baselineConstructiveRate: learningReview?.baselineConstructiveRate ?? null,
    summary: shorten(plan.summary),
    rationale: shorten(plan.rationale, 320),
    guardrails: buildGuardrails({
      experimentType: plan.experimentType,
      recommendedNextPosture: plan.recommendedNextPosture,
      plannedRelevantCycles: plan.plannedRelevantCycles,
    }).map((item) => shorten(item, 220)),
  };
}

export function persistAuditGuidanceExperimentReport(report: AuditGuidanceExperimentReport): string {
  const fullPath = join(ensureAuditGuidanceExperimentDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceExperimentHistory(limit = 10): AuditGuidanceExperimentReport[] {
  const directory = ensureAuditGuidanceExperimentDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceExperimentReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceExperimentReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceExperimentReport(): AuditGuidanceExperimentReport | null {
  return loadAuditGuidanceExperimentHistory(1)[0] ?? null;
}

export function latestAuditGuidanceExperimentReportPath(): string | null {
  return latestGuidanceExperimentReportPath();
}

export function formatAuditGuidanceExperimentReport(report: AuditGuidanceExperimentReport): string {
  return [
    `Audit guidance experiment @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Binding constraint: ${report.bindingConstraint}`,
    `Target dimensions: ${report.targetDimensions.join(", ") || "none"}`,
    `Current learning posture: ${report.currentLearningPosture}`,
    `Recommended next posture: ${report.recommendedNextPosture}`,
    `Experiment type: ${report.experimentType}`,
    `Planned relevant cycles: ${report.plannedRelevantCycles}`,
    `Review confidence: ${report.reviewConfidence}`,
    `Learning relevant items: ${report.learningRelevantItemCount}`,
    `Learning review: ${report.learningReviewPath ?? "none"}`,
    `Strongest reviewed posture: ${report.strongestReviewedPosture ?? "none"}`,
    `Weakest reviewed posture: ${report.weakestReviewedPosture ?? "none"}`,
    `Baseline constructive rate: ${report.baselineConstructiveRate === null ? "n/a" : `${Math.round(report.baselineConstructiveRate * 100)}%`}`,
    `Summary: ${report.summary}`,
    `Rationale: ${report.rationale}`,
    `Guardrails: ${report.guardrails.join(" | ") || "none"}`,
  ].join("\n");
}
