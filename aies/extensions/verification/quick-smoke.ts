import { createLayerAuditSnapshot } from "../evaluation/audit-radar-assessment.ts";
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

console.log([
  "Non-recursive AIES quick smoke passed.",
  `Snapshot: ${snapshot.snapshotId}`,
  `Snapshot summary: ${snapshot.summary}`,
  `Judgment tier: ${judgment.tier}`,
  `Judgment evidence: ${judgment.evidenceIds.join(", ")}`,
  `Binding constraint: ${snapshot.bindingConstraint.dimension}`,
].join("\n"));
