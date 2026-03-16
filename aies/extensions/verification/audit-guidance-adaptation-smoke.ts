import { createAuditGuidanceAdaptationReport } from "../evaluation/audit-radar-guidance-adaptation.ts";
import {
  createAuditGuidanceEffectivenessReport,
  loadAuditGuidanceEffectivenessHistory,
} from "../evaluation/audit-radar-guidance-effectiveness.ts";
import { loadAuditGuidanceOutcomeHistory } from "../evaluation/audit-radar-guidance-outcomes.ts";
import { latestAuditSnapshot } from "../evaluation/audit-radar-state.ts";

function fail(message: string): never {
  throw new Error(message);
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

const outcomes = loadAuditGuidanceOutcomeHistory(0);
const persistedEffectiveness = loadAuditGuidanceEffectivenessHistory(0);
const currentEffectiveness = createAuditGuidanceEffectivenessReport(outcomes);
const adaptation = createAuditGuidanceAdaptationReport();
const latestSnapshot = latestAuditSnapshot();

requireCondition(adaptation.advisoryOnly, "Audit guidance adaptation must stay advisory-only.");
requireCondition(adaptation.autoOverrideProhibited, "Audit guidance adaptation must explicitly prohibit auto-override.");
requireCondition(
  adaptation.corpus.guidanceOutcomes === outcomes.length,
  `Guidance-outcome corpus count drifted: expected ${outcomes.length}, received ${adaptation.corpus.guidanceOutcomes}.`,
);
requireCondition(
  adaptation.corpus.persistedEffectivenessReports === persistedEffectiveness.length,
  `Persisted effectiveness corpus count drifted: expected ${persistedEffectiveness.length}, received ${adaptation.corpus.persistedEffectivenessReports}.`,
);

if (currentEffectiveness) {
  const comparableItems = currentEffectiveness.items.filter((item) => item.verdict !== "insufficient_evidence").length;
  requireCondition(
    adaptation.corpus.comparableItems === comparableItems,
    `Comparable item count drifted: expected ${comparableItems}, received ${adaptation.corpus.comparableItems}.`,
  );
  requireCondition(
    adaptation.corpus.linkedPostRunAudits === currentEffectiveness.linkedPostRunAuditCount,
    `Linked post-run audit count drifted: expected ${currentEffectiveness.linkedPostRunAuditCount}, received ${adaptation.corpus.linkedPostRunAudits}.`,
  );
  requireCondition(
    adaptation.latestContext.effectivenessReportId,
    "Adaptation latestContext should point at a synthesized effectiveness report when guidance outcomes exist.",
  );
} else {
  requireCondition(
    adaptation.status === "insufficient_history",
    `Adaptation should remain insufficient_history without effectiveness data, but resolved to ${adaptation.status}.`,
  );
}

if (latestSnapshot) {
  requireCondition(
    adaptation.latestContext.snapshotId === latestSnapshot.snapshotId,
    `Adaptation latest snapshot drifted: expected ${latestSnapshot.snapshotId}, received ${adaptation.latestContext.snapshotId}.`,
  );
}

const thresholdsUnmet = adaptation.missingThresholds.length > 0;
if (thresholdsUnmet) {
  requireCondition(
    adaptation.status === "insufficient_history",
    `Thin-history adaptation should stay insufficient_history, but resolved to ${adaptation.status}.`,
  );
  requireCondition(
    adaptation.note.includes("insufficient_history"),
    "Thin-history adaptation note should state insufficient_history plainly.",
  );
  requireCondition(
    adaptation.recommendedAdjustment.includes("Do not tune guidance synthesis yet"),
    "Thin-history adaptation should recommend holding off on synthesis tuning.",
  );
} else {
  requireCondition(
    adaptation.status !== "insufficient_history",
    "Once thresholds are satisfied, adaptation should move beyond insufficient_history.",
  );
  requireCondition(
    adaptation.missingThresholds.length === 0,
    "Threshold-satisfied adaptation should not report missing thresholds.",
  );
}

console.log([
  "Audit guidance adaptation smoke passed.",
  `Latest snapshot: ${adaptation.latestContext.snapshotId ?? "none"}`,
  `Guidance outcomes: ${adaptation.corpus.guidanceOutcomes}`,
  `Persisted effectiveness reports: ${adaptation.corpus.persistedEffectivenessReports}`,
  `Comparable items: ${adaptation.corpus.comparableItems}`,
  `Linked post-run audits: ${adaptation.corpus.linkedPostRunAudits}`,
  `Status: ${adaptation.status}`,
  `Missing thresholds: ${adaptation.missingThresholds.join("; ") || "none"}`,
  `Recommended adjustment: ${adaptation.recommendedAdjustment}`,
].join("\n"));
