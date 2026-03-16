import { existsSync } from "node:fs";
import {
  createCoherenceSignalReport,
  loadLatestCoherenceSignalReport,
  persistCoherenceSignalReport,
} from "../coherence-signals/index.ts";

function fail(message: string): never {
  throw new Error(message);
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

const report = createCoherenceSignalReport();
requireCondition(report.advisoryOnly, "Coherence signals must stay advisory-only.");
requireCondition(report.summary.signalCount >= 3, "Coherence signal report should surface a bounded initial signal set.");

const localSignal = report.signals.find((signal) => signal.signalFamily === "subsystem_hotspot_concentration");
requireCondition(localSignal, "Coherence report should include a subsystem hotspot signal.");
requireCondition(localSignal.status === "observed", "Subsystem hotspot signal should be observed in the current corpus.");
requireCondition(localSignal.scope === "local", "Subsystem hotspot signal should classify as local.");
requireCondition(localSignal.citations.length >= 2, "Local coherence signals should carry multiple citations.");

const ambiguousSignal = report.signals.find((signal) => signal.signalFamily === "intent_action_misalignment");
requireCondition(ambiguousSignal, "Coherence report should include an intent/action tension signal.");
requireCondition(ambiguousSignal.status === "observed", "Intent/action tension should remain visible as an observed ambiguity.");
requireCondition(ambiguousSignal.scope === "ambiguous", "Intent/action tension should classify as ambiguous, not forced into local/global.");
requireCondition(ambiguousSignal.missingEvidence.length >= 1, "Ambiguous signals should explain what evidence is still missing.");

const insufficientSignal = report.signals.find((signal) => signal.signalFamily === "theory_runtime_mismatch");
requireCondition(insufficientSignal, "Coherence report should include a theory/runtime mismatch probe.");
requireCondition(insufficientSignal.status === "insufficient_evidence", "Theory/runtime mismatch should stay insufficient_evidence until more history exists.");
requireCondition(insufficientSignal.scope === null, "Insufficient-evidence signals should not pretend to have a scope classification.");

const outputPath = persistCoherenceSignalReport(report);
requireCondition(existsSync(outputPath), "Coherence signal smoke should persist the latest report.");

const reloaded = loadLatestCoherenceSignalReport();
requireCondition(reloaded !== null, "Coherence signal smoke should be able to reload the persisted report.");
requireCondition(reloaded.summary.signalCount === report.summary.signalCount, "Reloaded coherence report should match the persisted signal count.");
requireCondition(reloaded.summary.scopeCounts.local >= 1, "Reloaded coherence report should retain the local signal count.");
requireCondition(reloaded.summary.insufficientEvidenceCount >= 1, "Reloaded coherence report should retain insufficient-evidence signals.");

console.log([
  "Coherence signal smoke passed.",
  `Signals: ${report.summary.signalCount}`,
  `Observed: ${report.summary.observedCount}`,
  `Insufficient evidence: ${report.summary.insufficientEvidenceCount}`,
  `Persisted report: ${outputPath}`,
].join("\n"));
