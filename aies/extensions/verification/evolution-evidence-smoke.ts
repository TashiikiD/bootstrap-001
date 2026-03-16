import { buildEvolutionEvidenceBrief } from "../evidence/evolution-evidence-brief.ts";
import { createEvolutionEvidenceIndex, queryEvolutionEvidenceIndex } from "../evidence/evolution-evidence-index.ts";

function fail(message: string): never {
  throw new Error(message);
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

const index = createEvolutionEvidenceIndex();

requireCondition(index.advisoryOnly, "Evolution evidence index must stay advisory-only.");
requireCondition(index.summary.nodeCount > 0, "Evolution evidence index should contain at least one node.");
requireCondition(index.summary.relationCount > 0, "Evolution evidence index should contain at least one relation.");

const evidenceIndexThread = queryEvolutionEvidenceIndex(index, {
  changeIds: ["CHG-2026-03-16-evolution-evidence-index"],
  maxNodes: 8,
});

requireCondition(
  evidenceIndexThread.nodes.some((node) => node.artifactType === "openspec_change"),
  "Evolution evidence query should reconstruct the OpenSpec change node for CHG-2026-03-16-evolution-evidence-index.",
);
requireCondition(
  evidenceIndexThread.nodes.some((node) => node.artifactType === "devlog"),
  "Evolution evidence query should reconstruct at least one devlog continuation for CHG-2026-03-16-evolution-evidence-index.",
);
requireCondition(
  evidenceIndexThread.nodes.some((node) => node.summary !== "none"),
  "Evolution evidence query should surface non-empty summaries for the retrieved thread.",
);

const bindingConstraintBrief = buildEvolutionEvidenceBrief(index, "binding_constraint_support");
requireCondition(
  bindingConstraintBrief.nodes.length > 0,
  "Binding-constraint support brief should return cited evidence for the latest persisted audit snapshot.",
);
requireCondition(
  bindingConstraintBrief.nodes.some((node) => node.citations.length > 0),
  "Binding-constraint support brief should preserve citations for operator inspection.",
);

const unsupportedQuery = queryEvolutionEvidenceIndex(index, {
  dimensions: ["coherence"],
  text: "definitely-no-such-evidence-token-73c6b6d9",
  maxNodes: 3,
});
requireCondition(
  unsupportedQuery.nodes.length === 0,
  "Unsupported evolution evidence queries should return zero nodes instead of fabricated matches.",
);
requireCondition(
  unsupportedQuery.relations.length === 0,
  "Unsupported evolution evidence queries should return zero relations instead of fabricated support.",
);

console.log([
  "Evolution evidence smoke passed.",
  `Index summary: ${index.summary.nodeCount} nodes / ${index.summary.relationCount} relations`,
  `Change thread matches: ${evidenceIndexThread.nodes.length} nodes / ${evidenceIndexThread.relations.length} relations`,
  `Binding brief: ${bindingConstraintBrief.summary}`,
  `Unsupported query matches: ${unsupportedQuery.nodes.length} nodes / ${unsupportedQuery.relations.length} relations`,
].join("\n"));
