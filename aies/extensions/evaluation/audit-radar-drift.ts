import type {
  AuditDimensionDrift,
  LayerAuditAssessment,
  LayerAuditDrift,
  LayerAuditSnapshot,
} from "../../contracts/layer-audit-snapshot.ts";
import type { AiesAuditTier } from "../../contracts/layer-audit-snapshot.ts";
import type { AiesDimension } from "../../contracts/primitives.ts";

const THEORY_DIMENSIONS: AiesDimension[] = ["prompt", "context", "intent", "judgment", "coherence"];
const RUNTIME_DIMENSIONS: AiesDimension[] = ["evaluation", "harness"];

function tierValue(tier: AiesAuditTier): number {
  switch (tier) {
    case "strong":
      return 2;
    case "partial":
      return 1;
    default:
      return 0;
  }
}

function assessmentMap(snapshot: LayerAuditSnapshot): Map<AiesDimension, LayerAuditAssessment> {
  return new Map(snapshot.dimensions.map((assessment) => [assessment.dimension, assessment]));
}

function averageTier(snapshot: LayerAuditSnapshot, dimensions: AiesDimension[]): number {
  const map = assessmentMap(snapshot);
  const values = dimensions
    .map((dimension) => map.get(dimension))
    .filter((assessment): assessment is LayerAuditAssessment => Boolean(assessment))
    .map((assessment) => tierValue(assessment.tier));

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildDimensionDrift(
  current: LayerAuditAssessment,
  previous: LayerAuditAssessment | null,
): AuditDimensionDrift {
  if (!previous) {
    return {
      dimension: current.dimension,
      previousTier: null,
      currentTier: current.tier,
      change: "new",
      summary: `No prior snapshot exists for ${current.dimension}, so this is the baseline rating.`,
    };
  }

  const previousValue = tierValue(previous.tier);
  const currentValue = tierValue(current.tier);
  const change = currentValue > previousValue
    ? "improved"
    : currentValue < previousValue
    ? "regressed"
    : "unchanged";

  const summary = change === "improved"
    ? `${current.dimension} improved from ${previous.tier} to ${current.tier}.`
    : change === "regressed"
    ? `${current.dimension} regressed from ${previous.tier} to ${current.tier}.`
    : `${current.dimension} stayed ${current.tier}.`;

  return {
    dimension: current.dimension,
    previousTier: previous.tier,
    currentTier: current.tier,
    change,
    summary,
  };
}

function repeatedBindingConstraintCount(history: LayerAuditSnapshot[], current: LayerAuditSnapshot): number {
  const snapshots = [...history, current];
  let count = 0;
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (snapshot.bindingConstraint.dimension !== current.bindingConstraint.dimension) {
      break;
    }
    count += 1;
  }
  return count;
}

function hasTheoryRuntimeDivergence(snapshot: LayerAuditSnapshot): boolean {
  const theoryAverage = averageTier(snapshot, THEORY_DIMENSIONS);
  const runtimeAverage = averageTier(snapshot, RUNTIME_DIMENSIONS);
  const theoryStrongCount = snapshot.dimensions.filter((assessment) => THEORY_DIMENSIONS.includes(assessment.dimension) && assessment.tier === "strong").length;
  const runtimeWeakCount = snapshot.dimensions.filter((assessment) => RUNTIME_DIMENSIONS.includes(assessment.dimension) && assessment.tier !== "strong").length;

  return (theoryAverage - runtimeAverage >= 0.5 && runtimeWeakCount > 0) || (theoryStrongCount >= 2 && runtimeWeakCount === RUNTIME_DIMENSIONS.length);
}

export function buildAuditDrift(current: LayerAuditSnapshot, history: LayerAuditSnapshot[]): LayerAuditDrift {
  const previous = history.length > 0 ? history[history.length - 1] ?? null : null;
  const previousByDimension = previous ? assessmentMap(previous) : new Map<AiesDimension, LayerAuditAssessment>();
  const dimensionChanges = current.dimensions.map((assessment) => buildDimensionDrift(assessment, previousByDimension.get(assessment.dimension) ?? null));
  const improvedDimensions = dimensionChanges.filter((item) => item.change === "improved").map((item) => item.dimension);
  const regressedDimensions = dimensionChanges.filter((item) => item.change === "regressed").map((item) => item.dimension);
  const stagnantDimensions = dimensionChanges
    .filter((item) => item.change === "unchanged" && (item.currentTier === "partial" || item.currentTier === "missing"))
    .map((item) => item.dimension);
  const repeatedConstraint = repeatedBindingConstraintCount(history, current);
  const maintenanceLoopRisk = repeatedConstraint >= 2 && improvedDimensions.length === 0 && stagnantDimensions.length >= 3;
  const theoryRuntimeDivergence = hasTheoryRuntimeDivergence(current);

  const summary = !previous
    ? "No prior audit snapshot is available yet, so this snapshot establishes the baseline for future drift detection."
    : [
        improvedDimensions.length > 0 ? `Improved: ${improvedDimensions.join(", ")}.` : "Improved: none.",
        regressedDimensions.length > 0 ? `Regressed: ${regressedDimensions.join(", ")}.` : "Regressed: none.",
        stagnantDimensions.length > 0 ? `Stagnant weak layers: ${stagnantDimensions.join(", ")}.` : "Stagnant weak layers: none.",
        `Binding constraint streak: ${current.bindingConstraint.dimension} x${repeatedConstraint}.`,
        maintenanceLoopRisk ? "Maintenance-loop risk is emerging because the same weak layers persisted without improvement." : "No immediate maintenance-loop pattern detected.",
        theoryRuntimeDivergence ? "Theory/runtime divergence is present: declared or documented layers are still ahead of operational evaluation/harness capabilities." : "No major theory/runtime divergence detected.",
      ].join(" ");

  return {
    comparedToSnapshotId: previous?.snapshotId ?? null,
    comparedToObservedAt: previous?.observedAt ?? null,
    improvedDimensions,
    regressedDimensions,
    stagnantDimensions,
    repeatedBindingConstraintCount: repeatedConstraint,
    maintenanceLoopRisk,
    theoryRuntimeDivergence,
    dimensionChanges,
    summary,
  };
}

export function withAuditDrift(current: LayerAuditSnapshot, history: LayerAuditSnapshot[]): LayerAuditSnapshot {
  return {
    ...current,
    drift: buildAuditDrift(current, history),
  };
}
