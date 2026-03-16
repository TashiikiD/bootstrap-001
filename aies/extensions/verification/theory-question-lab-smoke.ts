import { existsSync } from "node:fs";
import {
  createTheoryQuestionLabReport,
  loadLatestTheoryQuestionLabReport,
  persistTheoryQuestionLabReport,
} from "../theory-question-lab/index.ts";

function fail(message: string): never {
  throw new Error(message);
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

const report = createTheoryQuestionLabReport();
requireCondition(report.advisoryOnly, "Theory-question lab must stay advisory-only.");
requireCondition(report.summary.questionCount >= 10, "Theory-question lab should recover a meaningful question corpus.");
requireCondition(report.summary.sourceCount >= 5, "Theory-question lab should recover questions from multiple theory files.");
requireCondition(
  report.questions.some((question) => question.dimensionHints.includes("prompt")),
  "Theory-question lab should include at least one prompt-layer question.",
);
requireCondition(
  report.questions.some((question) => question.dimensionHints.includes("coherence")),
  "Theory-question lab should include at least one coherence-layer question.",
);
requireCondition(
  report.questions.some((question) => question.ambiguityFlags.length > 0),
  "Theory-question lab should preserve ambiguity flags for underspecified questions.",
);
requireCondition(
  report.candidates.some((candidate) => candidate.breadthSignals.includes("neglected_layer_rotation")),
  "Theory-question lab should surface at least one rotation candidate outside the current evaluation hotspot.",
);
requireCondition(
  report.candidates.some((candidate) => candidate.minimumVerificationFloor === "docs_only"),
  "Theory-question lab should allow low-cost docs-only candidates where appropriate.",
);

const outputPath = persistTheoryQuestionLabReport(report);
requireCondition(existsSync(outputPath), "Theory-question lab smoke should persist the latest report.");

const reloaded = loadLatestTheoryQuestionLabReport();
requireCondition(reloaded !== null, "Theory-question lab smoke should be able to reload the persisted report.");
requireCondition(reloaded.summary.questionCount === report.summary.questionCount, "Reloaded theory-question lab report should match the persisted question count.");
requireCondition(reloaded.summary.candidateCount === report.summary.candidateCount, "Reloaded theory-question lab report should match the persisted candidate count.");

console.log([
  "Theory-question lab smoke passed.",
  `Questions: ${report.summary.questionCount}`,
  `Candidates: ${report.summary.candidateCount}`,
  `Ambiguous questions: ${report.summary.ambiguousQuestionCount}`,
  `Persisted report: ${outputPath}`,
].join("\n"));
