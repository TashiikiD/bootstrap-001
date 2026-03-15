import type { LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";

function compact(text: string, maxLength = 220): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function listOrNone(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "none";
}

export function formatAuditRadarStatus(snapshot: LayerAuditSnapshot, activeChangeId: string | null = null): string {
  return [
    `Audit snapshot: ${snapshot.snapshotId}`,
    `Observed: ${snapshot.observedAt}`,
    `Confidence: ${snapshot.confidence}`,
    `Binding constraint: ${snapshot.bindingConstraint.dimension}`,
    `Summary: ${snapshot.summary}`,
    `Drift: ${snapshot.drift?.summary ?? "none"}`,
    `Recommendation: ${snapshot.recommendedNextStep.summary}`,
    `Action type: ${snapshot.recommendedNextStep.actionType}`,
    `Target dimensions: ${listOrNone(snapshot.recommendedNextStep.targetDimensions)}`,
    `Suggested paths: ${listOrNone(snapshot.recommendedNextStep.suggestedPaths)}`,
    `Active change: ${activeChangeId ?? "none"}`,
  ].join("\n");
}

export function buildAuditRadarPromptBlock(snapshot: LayerAuditSnapshot, activeChangeId: string | null = null): string {
  return [
    "AIES AUDIT RADAR CONTEXT",
    `Latest durable audit: ${snapshot.snapshotId} @ ${snapshot.observedAt}`,
    `Binding constraint: ${snapshot.bindingConstraint.dimension}`,
    `Drift: ${compact(snapshot.drift?.summary ?? "none")}`,
    `Recommended direction: ${compact(snapshot.recommendedNextStep.summary)}`,
    `Target dimensions: ${listOrNone(snapshot.recommendedNextStep.targetDimensions)}`,
    `Active change in context: ${activeChangeId ?? "none"}`,
    "This is advisory only. Prefer continuing the active change when justified, but explain any divergence from the audit's recommended direction.",
  ].join("\n");
}

export function buildAuditRadarWidgetLines(snapshot: LayerAuditSnapshot | null): string[] {
  if (!snapshot) {
    return ["audit=none", "binding=none", "recommend=none"];
  }

  return [
    `audit=${snapshot.snapshotId}`,
    `binding=${snapshot.bindingConstraint.dimension}`,
    `drift=${compact(snapshot.drift?.summary ?? "none", 80)}`,
    `recommend=${compact(snapshot.recommendedNextStep.summary, 80)}`,
  ];
}
