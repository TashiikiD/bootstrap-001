import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  loadAuditGuidanceEffectivenessHistory,
  type AuditGuidanceEffectivenessItem,
  type AuditGuidanceEffectivenessReport,
  type AuditGuidanceEffectivenessVerdict,
} from "./audit-radar-guidance-effectiveness.ts";
import { loadAuditGuidanceOutcomeHistory } from "./audit-radar-guidance-outcomes.ts";
import type { AuditGuidanceLearningPosture } from "./audit-radar-guidance-learning.ts";

export interface AuditGuidanceLearningReviewBucket {
  posture: AuditGuidanceLearningPosture;
  itemCount: number;
  dimensions: AiesDimension[];
  verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number>;
  constructiveSignalCount: number;
  adverseSignalCount: number;
  linkedPostRunAuditCount: number;
  floorEscalationCount: number;
  shiftedBindingConstraintCount: number;
  persistedBindingConstraintCount: number;
  summary: string;
}

export interface AuditGuidanceLearningReviewReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  effectivenessReportCount: number;
  effectivenessItemCount: number;
  analyzedCount: number;
  postureCount: number;
  strongestPosture: AuditGuidanceLearningPosture | null;
  weakestPosture: AuditGuidanceLearningPosture | null;
  baselineConstructiveRate: number | null;
  summary: string;
  buckets: AuditGuidanceLearningReviewBucket[];
}

interface SourcedEffectivenessItem {
  sourceGeneratedAt: IsoTimestamp;
  item: AuditGuidanceEffectivenessItem;
}

const POSTURE_ORDER: AuditGuidanceLearningPosture[] = ["baseline", "reinforce", "cautious", "exploratory", "mixed"];

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(generatedAt: IsoTimestamp): string {
  return `audit-guidance-learning-review-${generatedAt.replace(/[:.]/g, "-")}`;
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

function normalizeReportFileName(report: AuditGuidanceLearningReviewReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function ensureAuditGuidanceLearningReviewDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceLearningReviewRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
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

function normalizePosture(value: string | null | undefined): AuditGuidanceLearningPosture {
  switch (value) {
    case "baseline":
    case "reinforce":
    case "cautious":
    case "exploratory":
    case "mixed":
      return value;
    default:
      return "baseline";
  }
}

function constructiveSignalCount(counts: Record<AuditGuidanceEffectivenessVerdict, number>): number {
  return counts.supportive_signal + counts.alternative_signal;
}

function adverseSignalCount(counts: Record<AuditGuidanceEffectivenessVerdict, number>): number {
  return counts.counter_signal;
}

function bucketScore(bucket: AuditGuidanceLearningReviewBucket): number | null {
  if (bucket.itemCount === 0) {
    return null;
  }

  return (bucket.constructiveSignalCount - bucket.adverseSignalCount) / bucket.itemCount;
}

function constructiveRate(bucket: AuditGuidanceLearningReviewBucket): number | null {
  if (bucket.itemCount === 0) {
    return null;
  }

  return bucket.constructiveSignalCount / bucket.itemCount;
}

function bucketSummary(bucket: AuditGuidanceLearningReviewBucket): string {
  const constructive = bucket.constructiveSignalCount;
  const adverse = bucket.adverseSignalCount;
  const dimensions = bucket.dimensions.join(", ") || "none";

  if (bucket.itemCount < 2) {
    return shorten(`${bucket.posture} posture has only ${bucket.itemCount} analyzed signal${bucket.itemCount === 1 ? "" : "s"} across ${dimensions}, so it is still anecdotal.`);
  }

  if (constructive > adverse) {
    return shorten(`${bucket.posture} posture shows more constructive than adverse signals across ${dimensions} (${constructive} constructive vs ${adverse} adverse), but the sample is still bounded.`);
  }

  if (adverse > constructive) {
    return shorten(`${bucket.posture} posture shows more adverse than constructive signals across ${dimensions} (${adverse} adverse vs ${constructive} constructive), so the policy should stay cautious about trusting it.`);
  }

  return shorten(`${bucket.posture} posture is mixed across ${dimensions}; constructive and adverse signals are tied, so no confident posture preference is justified yet.`);
}

function reportSummary(buckets: AuditGuidanceLearningReviewBucket[]): {
  summary: string;
  strongestPosture: AuditGuidanceLearningPosture | null;
  weakestPosture: AuditGuidanceLearningPosture | null;
  baselineConstructiveRate: number | null;
} {
  if (buckets.length === 0) {
    return {
      summary: "No guidance-learning posture evidence could be reviewed yet.",
      strongestPosture: null,
      weakestPosture: null,
      baselineConstructiveRate: null,
    };
  }

  const comparable = buckets.filter((bucket) => bucket.itemCount >= 2);
  const ranked = [...comparable]
    .map((bucket) => ({ bucket, score: bucketScore(bucket) ?? Number.NEGATIVE_INFINITY }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.bucket.itemCount - left.bucket.itemCount;
    });
  const strongestPosture = ranked[0]?.bucket.posture ?? null;
  const weakestPosture = ranked[ranked.length - 1]?.bucket.posture ?? null;
  const baselineBucket = buckets.find((bucket) => bucket.posture === "baseline") ?? null;
  const baselineConstructiveRate = baselineBucket ? constructiveRate(baselineBucket) : null;
  const strongestBucket = strongestPosture ? buckets.find((bucket) => bucket.posture === strongestPosture) ?? null : null;

  if (comparable.length === 0) {
    return {
      summary: "Guidance-learning review has only anecdotal posture evidence so far; collect repeated guided cycles before comparing baseline, cautious, or exploratory postures confidently.",
      strongestPosture,
      weakestPosture,
      baselineConstructiveRate,
    };
  }

  if (comparable.length === 1) {
    const only = comparable[0];
    return {
      summary: `${only.posture} is the only posture with repeated evidence so far, so the review can summarize it but cannot yet compare posture quality across the policy surface.`,
      strongestPosture,
      weakestPosture,
      baselineConstructiveRate,
    };
  }

  const strongestRate = strongestBucket ? constructiveRate(strongestBucket) : null;
  if (
    strongestBucket
    && baselineBucket
    && strongestBucket.posture !== "baseline"
    && strongestRate !== null
    && baselineConstructiveRate !== null
    && strongestRate > baselineConstructiveRate
  ) {
    return {
      summary: `${strongestBucket.posture} currently shows a stronger constructive signal rate than baseline (${Math.round(strongestRate * 100)}% vs ${Math.round(baselineConstructiveRate * 100)}%), but the review remains correlational and sample-bounded.`,
      strongestPosture,
      weakestPosture,
      baselineConstructiveRate,
    };
  }

  return {
    summary: `Repeated posture evidence now exists across ${comparable.length} learning postures; ${strongestPosture ?? "none"} currently looks strongest and ${weakestPosture ?? "none"} weakest, but the comparison remains correlational and should guide experiments rather than hard policy switches.`,
    strongestPosture,
    weakestPosture,
    baselineConstructiveRate,
  };
}

function isAuditGuidanceLearningReviewBucket(value: unknown): value is AuditGuidanceLearningReviewBucket {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceLearningReviewBucket>;
  return typeof candidate.posture === "string"
    && typeof candidate.itemCount === "number"
    && Array.isArray(candidate.dimensions)
    && typeof candidate.constructiveSignalCount === "number"
    && typeof candidate.adverseSignalCount === "number"
    && typeof candidate.summary === "string";
}

function isAuditGuidanceLearningReviewReport(value: unknown): value is AuditGuidanceLearningReviewReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceLearningReviewReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.effectivenessReportCount === "number"
    && typeof candidate.effectivenessItemCount === "number"
    && typeof candidate.analyzedCount === "number"
    && typeof candidate.summary === "string"
    && Array.isArray(candidate.buckets)
    && candidate.buckets.every((bucket) => isAuditGuidanceLearningReviewBucket(bucket));
}

function flattenEffectivenessHistory(reports: AuditGuidanceEffectivenessReport[]): SourcedEffectivenessItem[] {
  return reports.flatMap((report) => report.items.map((item) => ({
    sourceGeneratedAt: report.generatedAt,
    item,
  })));
}

function dedupeLatestItems(items: SourcedEffectivenessItem[]): AuditGuidanceEffectivenessItem[] {
  const latestByOutcome = new Map<string, SourcedEffectivenessItem>();
  const ordered = [...items].sort((left, right) => right.sourceGeneratedAt.localeCompare(left.sourceGeneratedAt));

  for (const item of ordered) {
    if (!latestByOutcome.has(item.item.guidanceOutcomeReportId)) {
      latestByOutcome.set(item.item.guidanceOutcomeReportId, item);
    }
  }

  return [...latestByOutcome.values()].map((entry) => entry.item);
}

function buildBuckets(items: AuditGuidanceEffectivenessItem[]): AuditGuidanceLearningReviewBucket[] {
  const outcomesById = new Map(loadAuditGuidanceOutcomeHistory(0).map((report) => [report.reportId, report]));
  const buckets = new Map<AuditGuidanceLearningPosture, AuditGuidanceLearningReviewBucket>();

  for (const item of items) {
    const outcome = outcomesById.get(item.guidanceOutcomeReportId);
    const posture = normalizePosture(outcome?.guidance.learningPosture ?? null);
    const bucket = buckets.get(posture) ?? {
      posture,
      itemCount: 0,
      dimensions: [],
      verdictCounts: createVerdictCounts(),
      constructiveSignalCount: 0,
      adverseSignalCount: 0,
      linkedPostRunAuditCount: 0,
      floorEscalationCount: 0,
      shiftedBindingConstraintCount: 0,
      persistedBindingConstraintCount: 0,
      summary: "",
    };

    bucket.itemCount += 1;
    bucket.verdictCounts[item.verdict] += 1;
    bucket.constructiveSignalCount = constructiveSignalCount(bucket.verdictCounts);
    bucket.adverseSignalCount = adverseSignalCount(bucket.verdictCounts);
    if (item.linkedPostRunAudit.loopId) {
      bucket.linkedPostRunAuditCount += 1;
    }
    if (item.verification.floorEscalated) {
      bucket.floorEscalationCount += 1;
    }
    if (item.linkedPostRunAudit.bindingConstraintOutcome === "shifted") {
      bucket.shiftedBindingConstraintCount += 1;
    }
    if (item.linkedPostRunAudit.bindingConstraintOutcome === "persisted") {
      bucket.persistedBindingConstraintCount += 1;
    }

    const dimensions = new Set(bucket.dimensions);
    for (const dimension of item.trackedDimensions) {
      dimensions.add(dimension);
    }
    bucket.dimensions = [...dimensions].sort();

    buckets.set(posture, bucket);
  }

  return POSTURE_ORDER
    .map((posture) => buckets.get(posture) ?? null)
    .filter((bucket): bucket is AuditGuidanceLearningReviewBucket => bucket !== null)
    .map((bucket) => ({
      ...bucket,
      summary: bucketSummary(bucket),
    }));
}

export function createAuditGuidanceLearningReviewReport(
  effectivenessHistory = loadAuditGuidanceEffectivenessHistory(0),
): AuditGuidanceLearningReviewReport | null {
  if (effectivenessHistory.length === 0) {
    return null;
  }

  const latestItems = dedupeLatestItems(flattenEffectivenessHistory(effectivenessHistory));
  if (latestItems.length === 0) {
    return null;
  }

  const buckets = buildBuckets(latestItems);
  const generatedAt = nowIso();
  const summary = reportSummary(buckets);

  return {
    reportId: createReportId(generatedAt),
    generatedAt,
    effectivenessReportCount: effectivenessHistory.length,
    effectivenessItemCount: effectivenessHistory.reduce((sum, report) => sum + report.items.length, 0),
    analyzedCount: latestItems.length,
    postureCount: buckets.length,
    strongestPosture: summary.strongestPosture,
    weakestPosture: summary.weakestPosture,
    baselineConstructiveRate: summary.baselineConstructiveRate,
    summary: shorten(summary.summary),
    buckets,
  };
}

export function persistAuditGuidanceLearningReviewReport(report: AuditGuidanceLearningReviewReport): string {
  const fullPath = join(ensureAuditGuidanceLearningReviewDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceLearningReviewHistory(limit = 10): AuditGuidanceLearningReviewReport[] {
  const directory = ensureAuditGuidanceLearningReviewDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceLearningReviewReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceLearningReviewReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceLearningReviewReport(): AuditGuidanceLearningReviewReport | null {
  return loadAuditGuidanceLearningReviewHistory(1)[0] ?? null;
}

export function formatAuditGuidanceLearningReviewReport(
  report: AuditGuidanceLearningReviewReport,
  bucketLimit = POSTURE_ORDER.length,
): string {
  const buckets = report.buckets.slice(0, Math.max(1, bucketLimit));
  const lines = [
    `Audit guidance learning review @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Summary: ${report.summary}`,
    `Compared postures: ${report.postureCount}`,
    `Strongest posture: ${report.strongestPosture ?? "none"}`,
    `Weakest posture: ${report.weakestPosture ?? "none"}`,
    `Baseline constructive rate: ${report.baselineConstructiveRate === null ? "n/a" : `${Math.round(report.baselineConstructiveRate * 100)}%`}`,
  ];

  for (const bucket of buckets) {
    lines.push("");
    lines.push(`${bucket.posture} (${bucket.itemCount})`);
    lines.push(`Dimensions: ${bucket.dimensions.join(", ") || "none"}`);
    lines.push(`Verdicts: supportive=${bucket.verdictCounts.supportive_signal}, counter=${bucket.verdictCounts.counter_signal}, alternative=${bucket.verdictCounts.alternative_signal}, mixed=${bucket.verdictCounts.mixed_signal}, insufficient=${bucket.verdictCounts.insufficient_evidence}`);
    lines.push(`Signals: constructive=${bucket.constructiveSignalCount}, adverse=${bucket.adverseSignalCount}`);
    lines.push(`Binding shifts: ${bucket.shiftedBindingConstraintCount}, persisted: ${bucket.persistedBindingConstraintCount}`);
    lines.push(`Linked audits: ${bucket.linkedPostRunAuditCount}/${bucket.itemCount} · scope-floor escalations: ${bucket.floorEscalationCount}`);
    lines.push(`Detail: ${bucket.summary}`);
  }

  return lines.join("\n");
}
