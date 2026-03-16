import { createLayerAuditSnapshot } from "../evaluation/audit-radar-assessment.ts";
import { createAuditGuidanceAdaptationReport } from "../evaluation/audit-radar-guidance-adaptation.ts";
import { buildAuditJudgmentPromptBlock } from "../evaluation/audit-judgment-gate.ts";
import { scanAuditEvidence } from "../evaluation/audit-radar-scanner.ts";
import { loadAuditSnapshotHistory } from "../evaluation/audit-radar-state.ts";

const REQUIRED_JUDGMENT_EVIDENCE = [
  "audit-judgment-redlines",
  "audit-judgment-escalation-boundaries",
  "audit-judgment-pause-brief",
  "audit-judgment-pause-bridge",
];

function fail(message: string): never {
  throw new Error(message);
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

const scan = scanAuditEvidence();
const snapshot = createLayerAuditSnapshot(scan, loadAuditSnapshotHistory(10));
const judgment = snapshot.dimensions.find((item) => item.dimension === "judgment");

requireCondition(judgment, "Judgment assessment is missing from the audit snapshot.");

for (const evidenceId of REQUIRED_JUDGMENT_EVIDENCE) {
  requireCondition(
    judgment.evidenceIds.includes(evidenceId),
    `Judgment evidence is missing required proof: ${evidenceId}.`,
  );
}

requireCondition(
  judgment.tier === "strong",
  `Judgment tier should be strong after the gate integration, but resolved to ${judgment.tier}.`,
);

const promptBlock = buildAuditJudgmentPromptBlock({
  activeChangeId: "CHG-2026-03-15-audit-judgment-gate",
  bindingConstraint: snapshot.bindingConstraint.dimension,
  liveStatusInterpretation: "quick-smoke",
});

requireCondition(
  promptBlock.includes("AIES JUDGMENT GATE"),
  "Judgment prompt block is missing its heading.",
);
requireCondition(
  promptBlock.includes("Why is this step the highest-leverage move now?"),
  "Judgment prompt block is missing the explicit pause question.",
);

const adaptation = createAuditGuidanceAdaptationReport();
requireCondition(
  adaptation.advisoryOnly && adaptation.autoOverrideProhibited,
  "Guidance adaptation must remain advisory-only and must not auto-override audit guidance.",
);

const thresholdsUnmet = adaptation.corpus.persistedEffectivenessReports < adaptation.thresholds.minimumPersistedEffectivenessReports
  || adaptation.corpus.guidanceOutcomes < adaptation.thresholds.minimumGuidanceOutcomes
  || adaptation.corpus.comparableItems < adaptation.thresholds.minimumComparableItems
  || adaptation.corpus.linkedPostRunAudits < adaptation.thresholds.minimumLinkedPostRunAudits;

if (thresholdsUnmet) {
  requireCondition(
    adaptation.status === "insufficient_history",
    `Guidance adaptation should stay conservative when history is thin, but resolved to ${adaptation.status}.`,
  );
  requireCondition(
    adaptation.note.includes("insufficient_history"),
    "Guidance adaptation note should state insufficient_history plainly when thresholds are not met.",
  );
}

console.log([
  "Non-recursive AIES quick smoke passed.",
  `Snapshot: ${snapshot.snapshotId}`,
  `Snapshot summary: ${snapshot.summary}`,
  `Judgment tier: ${judgment.tier}`,
  `Judgment evidence: ${judgment.evidenceIds.join(", ")}`,
  `Binding constraint: ${snapshot.bindingConstraint.dimension}`,
  `Guidance adaptation: ${adaptation.status}`,
  `Guidance adaptation note: ${adaptation.note}`,
].join("\n"));
