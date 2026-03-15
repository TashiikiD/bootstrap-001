import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import {
  latestAuditGuidanceEffectivenessReport,
  type AuditGuidanceEffectivenessItem,
  type AuditGuidanceEffectivenessVerdict,
} from "./audit-radar-guidance-effectiveness.ts";

export type AuditGuidanceLearningPosture = "baseline" | "reinforce" | "cautious" | "exploratory" | "mixed";

export interface AuditGuidanceLearningPolicy {
  posture: AuditGuidanceLearningPosture;
  summary: string;
  recommendationNote: string;
  relevantItemCount: number;
  verdictCounts: Record<AuditGuidanceEffectivenessVerdict, number>;
  reportGeneratedAt: IsoTimestamp | null;
  reportPath: string | null;
}

const DEFAULT_WINDOW = 6;

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 240): string {
  const compact = normalize(text);
  if (!compact) {
    return "none";
  }

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function latestGuidanceEffectivenessReportPath(): string | null {
  const root = getAiesPaths().auditRadarGuidanceEffectivenessRoot;
  if (!existsSync(root)) {
    return null;
  }

  const candidate = readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return candidate ? projectRelativePath(join(root, candidate)) : null;
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

function relevantDimensions(bindingConstraint: AiesDimension, targetDimensions: AiesDimension[]): Set<AiesDimension> {
  return new Set([bindingConstraint, ...targetDimensions]);
}

function isRelevantItem(item: AuditGuidanceEffectivenessItem, dimensions: Set<AiesDimension>): boolean {
  if (dimensions.has(item.guidanceBindingConstraint)) {
    return true;
  }

  return item.trackedDimensions.some((dimension) => dimensions.has(dimension))
    || item.matchedTargetDimensions.some((dimension) => dimensions.has(dimension))
    || item.targetDimensionEffects.some((effect) => dimensions.has(effect.dimension));
}

function countVerdicts(items: AuditGuidanceEffectivenessItem[]): Record<AuditGuidanceEffectivenessVerdict, number> {
  const counts = createVerdictCounts();
  for (const item of items) {
    counts[item.verdict] += 1;
  }
  return counts;
}

function nonInsufficientSignalCount(counts: Record<AuditGuidanceEffectivenessVerdict, number>): number {
  return counts.supportive_signal + counts.counter_signal + counts.alternative_signal + counts.mixed_signal;
}

function describeCounts(counts: Record<AuditGuidanceEffectivenessVerdict, number>): string {
  return `supportive=${counts.supportive_signal}, counter=${counts.counter_signal}, alternative=${counts.alternative_signal}, mixed=${counts.mixed_signal}, insufficient=${counts.insufficient_evidence}`;
}

function decidePosture(counts: Record<AuditGuidanceEffectivenessVerdict, number>, relevantItemCount: number): AuditGuidanceLearningPosture {
  const decisiveSignals = nonInsufficientSignalCount(counts);
  if (relevantItemCount < 2 || decisiveSignals < 2) {
    return "baseline";
  }

  if (
    counts.supportive_signal >= 2
    && counts.supportive_signal > counts.counter_signal + counts.alternative_signal
    && counts.supportive_signal >= counts.mixed_signal
  ) {
    return "reinforce";
  }

  if (
    counts.counter_signal >= 2
    && counts.counter_signal >= counts.supportive_signal + 1
    && counts.counter_signal >= counts.alternative_signal
  ) {
    return "cautious";
  }

  if (
    counts.alternative_signal >= 2
    && counts.alternative_signal >= counts.supportive_signal + 1
    && counts.alternative_signal > counts.counter_signal
  ) {
    return "exploratory";
  }

  return "mixed";
}

function summarizePolicy(args: {
  posture: AuditGuidanceLearningPosture;
  bindingConstraint: AiesDimension;
  targetDimensions: AiesDimension[];
  relevantItemCount: number;
  counts: Record<AuditGuidanceEffectivenessVerdict, number>;
  hasReport: boolean;
}): { summary: string; recommendationNote: string } {
  const dimensions = args.targetDimensions.length > 0 ? args.targetDimensions.join(", ") : args.bindingConstraint;
  const countSummary = describeCounts(args.counts);

  if (!args.hasReport) {
    return {
      summary: `No durable guidance-effectiveness report exists yet for ${dimensions}, so the audit should treat the latest guidance as a hypothesis rather than as a learned policy.`,
      recommendationNote: "No learning adjustment yet; gather guided history before adapting the guidance pattern.",
    };
  }

  if (args.relevantItemCount === 0) {
    return {
      summary: `A guidance-effectiveness report exists, but none of its items track ${dimensions}, so the audit should keep the default guidance until relevant history appears.`,
      recommendationNote: "No relevant learning signal yet; keep the default guidance for this binding constraint.",
    };
  }

  if (args.posture === "baseline") {
    return {
      summary: `Only ${args.relevantItemCount} relevant guidance-effectiveness signal${args.relevantItemCount === 1 ? " is" : "s are"} available for ${dimensions} (${countSummary}), so the audit should avoid overfitting and keep the default guidance posture for now.`,
      recommendationNote: "Keep the default guidance and collect more repeated guided history before changing synthesis.",
    };
  }

  if (args.posture === "reinforce") {
    return {
      summary: `Recent relevant guidance-effectiveness signals lean supportive for ${dimensions} (${countSummary}), so the audit can reinforce the current correction path without pretending the evidence is conclusive.`,
      recommendationNote: "Recent relevant signals are supportive; keep the recommended correction path unless the change surface shifts.",
    };
  }

  if (args.posture === "cautious") {
    return {
      summary: `Recent relevant aligned guidance has produced more counter-signals than support for ${dimensions} (${countSummary}), so the audit should keep the target dimensions but stop repeating the same correction pattern blindly.`,
      recommendationNote: "Counter-signals are accumulating; keep the target dimensions, but vary the correction path instead of repeating the same guidance pattern.",
    };
  }

  if (args.posture === "exploratory") {
    return {
      summary: `Recent relevant divergent choices are producing alternative signals for ${dimensions} (${countSummary}), so the audit should keep the binding constraint in view while allowing bounded alternative correction paths.`,
      recommendationNote: "Alternative signals are accumulating; keep the binding constraint, but allow evidence-backed alternative correction paths.",
    };
  }

  return {
    summary: `Recent relevant guidance-effectiveness signals conflict for ${dimensions} (${countSummary}), so the audit should keep the default recommendation but treat it as a hypothesis and compare outcomes explicitly.`,
    recommendationNote: "Signals are mixed; keep the default guidance, but compare outcomes explicitly instead of trusting alignment alone.",
  };
}

export function createAuditGuidanceLearningPolicy(
  bindingConstraint: AiesDimension,
  targetDimensions: AiesDimension[],
  windowSize = DEFAULT_WINDOW,
): AuditGuidanceLearningPolicy {
  const report = latestAuditGuidanceEffectivenessReport();
  const reportPath = latestGuidanceEffectivenessReportPath();
  const emptyCounts = createVerdictCounts();

  if (!report) {
    const policy = summarizePolicy({
      posture: "baseline",
      bindingConstraint,
      targetDimensions,
      relevantItemCount: 0,
      counts: emptyCounts,
      hasReport: false,
    });

    return {
      posture: "baseline",
      summary: shorten(policy.summary),
      recommendationNote: shorten(policy.recommendationNote),
      relevantItemCount: 0,
      verdictCounts: emptyCounts,
      reportGeneratedAt: null,
      reportPath: null,
    };
  }

  const relevant = relevantDimensions(bindingConstraint, targetDimensions);
  const items = report.items
    .filter((item) => isRelevantItem(item, relevant))
    .sort((left, right) => right.guidanceOutcomeGeneratedAt.localeCompare(left.guidanceOutcomeGeneratedAt))
    .slice(0, Math.max(1, windowSize));

  const counts = countVerdicts(items);
  const posture = decidePosture(counts, items.length);
  const policy = summarizePolicy({
    posture,
    bindingConstraint,
    targetDimensions,
    relevantItemCount: items.length,
    counts,
    hasReport: true,
  });

  return {
    posture,
    summary: shorten(policy.summary),
    recommendationNote: shorten(policy.recommendationNote),
    relevantItemCount: items.length,
    verdictCounts: counts,
    reportGeneratedAt: report.generatedAt,
    reportPath,
  };
}
