import type {
  AuditRecommendation,
  BindingConstraintAssessment,
  LayerAuditAssessment,
  LayerAuditSnapshot,
} from "../../contracts/layer-audit-snapshot.ts";
import type { AuditEvidenceItem } from "../../contracts/layer-audit-snapshot.ts";
import {
  AIES_AUDIT_TIERS,
} from "../../contracts/layer-audit-snapshot.ts";
import { AIES_DIMENSIONS, type AiesDimension, type EvaluationConfidence } from "../../contracts/primitives.ts";
import type { AuditEvidenceScanResult } from "./audit-radar-scanner.ts";
import { withAuditDrift } from "./audit-radar-drift.ts";

type DimensionRule = {
  dimension: AiesDimension;
  requiredEvidenceIds: string[];
  strongSummary: string;
  partialSummary: string;
  missingSummary: string;
  strengthTemplates: string[];
  protocolGapChecks: (evidence: AuditEvidenceItem[]) => string[];
  highestLeverageNextStep: string | ((evidence: AuditEvidenceItem[]) => string);
  recommendationActionType: AuditRecommendation["actionType"];
  suggestedPaths: string[];
};

const BINDING_CONSTRAINT_PRIORITY: AiesDimension[] = [
  "evaluation",
  "coherence",
  "judgment",
  "harness",
  "context",
  "intent",
  "prompt",
];

function createSnapshotId(observedAt: string): string {
  return `audit-${observedAt.replace(/[:.]/g, "-")}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function tierRank(tier: LayerAuditAssessment["tier"]): number {
  const index = AIES_AUDIT_TIERS.indexOf(tier);
  return index === -1 ? Number.MAX_SAFE_INTEGER : AIES_AUDIT_TIERS.length - index;
}

function summarizeEvidence(item: AuditEvidenceItem): string {
  const source = item.sourcePath ?? item.sourceType;
  return `${item.summary} (${source})`;
}

function missingRequiredEvidenceGaps(rule: DimensionRule, evidence: AuditEvidenceItem[]): string[] {
  const presentIds = new Set(evidence.map((item) => item.evidenceId));
  const missingIds = rule.requiredEvidenceIds.filter((evidenceId) => !presentIds.has(evidenceId));
  return missingIds.map((evidenceId) => `Missing expected audit evidence: ${evidenceId}.`);
}

function conservativeTier(rule: DimensionRule, evidence: AuditEvidenceItem[]): LayerAuditAssessment["tier"] {
  if (evidence.length === 0) {
    return "missing";
  }

  const gaps = [
    ...missingRequiredEvidenceGaps(rule, evidence),
    ...rule.protocolGapChecks(evidence),
  ];

  const presentIds = new Set(evidence.map((item) => item.evidenceId));
  const hasAllRequiredEvidence = rule.requiredEvidenceIds.every((evidenceId) => presentIds.has(evidenceId));

  if (hasAllRequiredEvidence && evidence.length >= Math.max(2, rule.requiredEvidenceIds.length) && gaps.length === 0) {
    return "strong";
  }

  return "partial";
}

function buildRules(): DimensionRule[] {
  return [
    {
      dimension: "prompt",
      requiredEvidenceIds: [
        "audit-prompt-agents-structured-cycle",
        "audit-prompt-openspec-skill-decomposition",
      ],
      strongSummary: "Prompt engineering is explicit, structured, and restart-stable across both repo-wide cycle instructions and implementation workflow guidance.",
      partialSummary: "Prompt engineering exists, but the audit cannot yet confirm that structured instructions stay consistent across all important execution surfaces.",
      missingSummary: "The audit found no explicit prompt-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "Cycle-level instructions define role, scope, constraints, and success shape explicitly.",
        "Implementation guidance decomposes work into steps and pause conditions instead of relying on ad-hoc prompting.",
      ],
      protocolGapChecks: () => [],
      highestLeverageNextStep: "Add a first-class audit prompt/report template so future layer audits are requested in a uniform format instead of relying on command discoverability.",
      recommendationActionType: "tool",
      suggestedPaths: ["aies/extensions/evaluation/", "aies/prompts/"],
    },
    {
      dimension: "context",
      requiredEvidenceIds: [
        "audit-context-memory-tree",
        "audit-context-memory-readme",
      ],
      strongSummary: "Context engineering is durable and curated enough to survive restart, with explicit memory roots and documented storage semantics.",
      partialSummary: "Context engineering is durable, but the audit still lacks evidence of task-specific retrieval, pruning, or restart-aware context packaging beyond static memory roots.",
      missingSummary: "The audit found no explicit durable context-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "Durable memory roots preserve context across sessions in operator-visible files.",
        "Memory storage is documented in human-readable form rather than hidden in transient state.",
      ],
      protocolGapChecks: () => [
        "No cited evidence yet of task-specific retrieval, pruning, or restart-aware context selection beyond static durable memory roots.",
      ],
      highestLeverageNextStep: "Create an audit-context pack builder that selects only the layer-relevant theory, memory, and runtime files needed for a given audit run.",
      recommendationActionType: "tool",
      suggestedPaths: ["aies/extensions/shared/", "memory/", "docs/foundations/"],
    },
    {
      dimension: "intent",
      requiredEvidenceIds: [
        "audit-intent-north-star",
        "audit-intent-active-change-direction",
      ],
      strongSummary: "Intent engineering is explicit and durable: AIES has a north star, ranked priorities, and a live change direction that ties local work to system evolution.",
      partialSummary: "Intent engineering is present, but the audit cannot yet confirm that diagnosed gaps automatically flow into future planning and task selection.",
      missingSummary: "The audit found no explicit intent-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "A durable intent hierarchy encodes project-level goals and tradeoff preferences.",
        "Active OpenSpec work gives the current cycle a visible multi-step direction instead of ad-hoc local optimization.",
      ],
      protocolGapChecks: () => [],
      highestLeverageNextStep: "Turn audit findings into a draft OpenSpec proposal path so explicit intent keeps propagating into future cycle selection.",
      recommendationActionType: "openspec_change",
      suggestedPaths: ["openspec/changes/", "aies/extensions/openspec/", "memory/knowledge/intent-hierarchy.yaml"],
    },
    {
      dimension: "judgment",
      requiredEvidenceIds: [
        "audit-judgment-redlines",
        "audit-judgment-escalation-boundaries",
      ],
      strongSummary: "Judgment engineering is explicit, proactive, and bounded by encoded pause conditions, autonomy limits, and uncertainty protocols.",
      partialSummary: "Judgment engineering has explicit red lines and escalation boundaries, but the audit still lacks strong evidence of proactive pause-and-doubt mechanisms embedded into execution flow.",
      missingSummary: "The audit found no explicit judgment-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "Explicit red lines constrain unsafe or misleading autonomous behavior.",
        "Autonomy boundaries and escalation triggers are encoded instead of being left implicit.",
      ],
      protocolGapChecks: () => [
        "Current evidence shows guardrails and escalation boundaries, but not yet a strong repo-native mechanism that forces pre-implementation pause-and-doubt inside the audit flow itself.",
      ],
      highestLeverageNextStep: "Add an audit judgment gate that refuses strong ratings when evidence is thin, ambiguous, or purely post-hoc.",
      recommendationActionType: "extension",
      suggestedPaths: ["aies/extensions/evaluation/", "AGENTS.md", ".pi/skills/openspec-apply-change/SKILL.md"],
    },
    {
      dimension: "coherence",
      requiredEvidenceIds: [
        "audit-coherence-charter",
        "audit-coherence-theory-fork",
      ],
      strongSummary: "Coherence engineering has durable identity commitments, an evolving interpretation layer, and a native drift monitor that can compare audit state across time.",
      partialSummary: "Coherence engineering is explicitly articulated and now has native drift comparison, but longitudinal evidence is still thin and not yet deeply integrated into broader runtime review.",
      missingSummary: "The audit found no explicit coherence-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "A durable coherence charter defines identity commitments and failure signals.",
        "The theory fork preserves an explicit interpretation layer instead of letting coherence drift stay implicit.",
      ],
      protocolGapChecks: (evidence) => evidence.some((item) => item.evidenceId === "audit-coherence-audit-radar-drift")
        ? ["A native drift monitor now exists, but the audit still has limited longitudinal history proving that it meaningfully catches session-to-session behavioral drift."]
        : ["No cited evidence yet of native drift detection across sessions, changes, or accumulated maintenance loops."],
      highestLeverageNextStep: "Use repeated audit snapshots to test whether coherence drift warnings actually change future cycle choices rather than staying descriptive.",
      recommendationActionType: "theory_experiment",
      suggestedPaths: ["memory/knowledge/audit-radar/snapshots/", "memory/knowledge/coherence-charter.yaml", "aies/extensions/evaluation/"],
    },
    {
      dimension: "evaluation",
      requiredEvidenceIds: [
        "audit-evaluation-snapshot-logic",
        "audit-evaluation-verification-recovery",
        "audit-evaluation-verification-scope-advisor",
        "audit-evaluation-audit-radar-persistence",
        "audit-evaluation-audit-radar-proposal-bridge",
        "audit-evaluation-audit-radar-reconciliation-bridge",
        "audit-evaluation-audit-radar-outcome-comparator",
        "audit-evaluation-audit-radar-outcome-report",
        "audit-evaluation-audit-radar-loop-command",
        "audit-evaluation-audit-radar-cycle-orchestration",
        "audit-evaluation-audit-radar-loop-report",
        "audit-evaluation-audit-radar-orchestrated-loop-report",
        "audit-evaluation-audit-radar-guidance-outcome-tracker",
        "audit-evaluation-audit-radar-guidance-outcome-cycle-bridge",
        "audit-evaluation-audit-radar-guidance-outcome-report",
        "audit-evaluation-audit-radar-guidance-effectiveness-comparator",
        "audit-evaluation-audit-radar-guidance-effectiveness-report",
      ],
      strongSummary: "Evaluation engineering is multi-layer, automated, and able to diagnose failures by originating layer with durable audit evidence, scope-aware verification planning, historical comparison, plan reconciliation, correction-path outcome reports, native audit-loop execution, cycle-orchestrated evaluation, recorded verification/recovery results tied to the same run, explicit guidance-alignment evidence about whether audit advice changed later focus selection, and longitudinal guidance-effectiveness comparison against later audit movement.",
      partialSummary: "Evaluation engineering now has structural scoring, verification surfaces, scope-aware verification planning, durable audit snapshots, audit-driven proposal drafting, active-change reconciliation, correction-path comparison, a native audit-loop command, cycle-runner orchestration, next-cycle audit guidance, guidance-alignment tracking, and a guidance-effectiveness comparator, but attribution is still coarse once multiple interventions overlap and the new comparator still needs repeated longitudinal history to tune future guidance generation confidently.",
      missingSummary: "The audit found no explicit evaluation-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "The runtime already records structured evaluation snapshots rather than relying only on narrative self-report.",
        "Verification and recovery are tracked as explicit state surfaces that can be inspected by later cycles.",
      ],
      protocolGapChecks: (evidence) => evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-effectiveness-report")
        ? ["The audit can now compare guidance alignment against immediate post-run audit movement, correction paths, and scope-aware verification floors, but attribution is still short-horizon and the comparator still needs repeated history before it should tune guidance generation aggressively."]
        : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-effectiveness-comparator")
          ? ["The audit now has a longitudinal guidance-effectiveness comparator, but it does not yet have a durable guidance-effectiveness report proving the comparator has been exercised on real guided history."]
          : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-outcome-report")
            ? ["The audit now records whether guidance aligned with a real cycle's chosen focus and can floor verification by actual change surface, but it still needs longitudinal comparison against later audit drift and correction-path outcomes to know whether that alignment actually improved the system."]
            : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-outcome-tracker")
              && evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-outcome-cycle-bridge")
              ? ["The audit can now persist guidance-alignment reports from the cycle runner, but it does not yet have a durable guidance-outcome report proving the tracker has been exercised on a real guided cycle."]
              : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-orchestrated-loop-report")
                && evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-bridge")
                ? ["The audit now observes, records, and guides future cycles, but it still needs longitudinal proof that audit guidance changes focus selection or correction-path outcomes instead of only producing better advisory text."]
                : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-orchestrated-loop-report")
                  ? ["Cycle orchestration now runs the audit loop, but attribution is still coarse when multiple interventions overlap and the experiment still needs durable reflection in memory so future cycles can tell what the audit got right or wrong."]
                  : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-cycle-orchestration")
                    ? ["Cycle orchestration is wired to invoke the audit loop, but the audit does not yet have a durable orchestrated loop report proving the hook has been exercised on a real cycle."]
                    : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-loop-report")
                      ? ["A native audit loop now runs assessment, outcome comparison, and quick verification together, but attribution is still coarse when multiple interventions overlap and the loop still depends on explicit invocation rather than cycle-level orchestration."]
                      : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-loop-command")
                        ? ["A native audit loop command exists, but the audit does not yet have a durable loop report proving it has been exercised on real sessions."]
                        : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-outcome-report")
                          ? ["A correction-path comparison loop now exists, but attribution is still correlational when multiple interventions overlap and the harness does not yet run the loop automatically."]
                          : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-outcome-comparator")
                            ? ["The audit can now compare correction paths in principle, but no durable outcome report has been generated yet to prove the loop is operating across real audit intervals."]
                            : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-reconciliation-bridge")
                              ? ["Audit findings can now reconcile into active OpenSpec plans, but evaluation still does not compare which correction path — reconciled change work, verification follow-up, or operator intervention — actually improved later audit outcomes."]
                              : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-proposal-bridge")
                                ? ["The audit can now draft follow-on OpenSpec changes, but repeated findings still do not automatically reconcile against existing plans or task queues."]
                                : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-persistence")
                                  ? ["The audit can now persist and compare snapshots, but findings still do not automatically draft or update planning artifacts when a binding constraint repeats."]
                                  : ["Current evidence is still stronger at structural evaluation than at durable cross-layer diagnosis and correction-path comparison."],
      highestLeverageNextStep: (evidence) => evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-effectiveness-report")
        ? "Use repeated guidance-effectiveness reports to tune how audit guidance is synthesized, especially when aligned guidance keeps producing stagnant weak layers or when divergent choices outperform it."
        : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-effectiveness-comparator")
          ? "Exercise the guidance-effectiveness comparator on durable guided history so evaluation can compare aligned guidance against later audit movement instead of stopping at focus alignment."
          : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-outcome-report")
            ? "Compare guidance-alignment reports and scope-aware verification floors against later audit drift and correction-path outcomes so evaluation can tell whether following the guidance actually helped."
            : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-outcome-tracker")
              && evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-outcome-cycle-bridge")
              ? "Exercise the guidance-outcome tracker on a real guided cycle so evaluation can observe whether the harness followed its own audit advice."
              : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-orchestrated-loop-report")
                && evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-guidance-bridge")
                ? "Compare future cycle focus choices against audit guidance so the audit can prove it is steering evolution rather than only describing it."
                : evidence.some((item) => item.evidenceId === "audit-evaluation-audit-radar-orchestrated-loop-report")
                  ? "Record the orchestrated audit experiment back into devlog and theory-fork so future cycles can reuse what the audit loop caught, missed, and still cannot attribute cleanly."
                  : "Integrate the audit loop into cycle orchestration so audit assessment, outcome comparison, and proportionate verification happen consistently instead of only by manual command use.",
      recommendationActionType: "tool",
      suggestedPaths: ["aies/extensions/evaluation/", "aies/extensions/cycle-runner/", "verify-aies-quick.ps1"],
    },
    {
      dimension: "harness",
      requiredEvidenceIds: [
        "audit-harness-extension-registry",
        "audit-harness-operator-ui-bridge",
        "audit-harness-proportionate-verification-bridge",
        "audit-harness-audit-radar-loop-command",
        "audit-harness-audit-radar-cycle-orchestration",
        "audit-harness-audit-radar-loop-report",
        "audit-harness-audit-radar-orchestrated-loop-report",
      ],
      strongSummary: "Harness engineering is explicit, reproducible, and sufficiently automated to carry orchestration, operator transparency, evaluation, and scope-aware verification without relying on hidden local setup.",
      partialSummary: "Harness engineering is real and reproducible, and now includes cycle-orchestrated audit-loop execution with durable reports plus change-surface-aware verification flooring, but the verification path is still deliberately lightweight and the experiment still needs durable reflection in memory.",
      missingSummary: "The audit found no explicit harness-engineering artifacts in the curated scan roots.",
      strengthTemplates: [
        "Pi settings make extension, prompt, and skill registration explicit and reproducible.",
        "The operator UI backend provides a visible control and execution bridge instead of relying on hidden orchestration.",
      ],
      protocolGapChecks: (evidence) => evidence.some((item) => item.evidenceId === "audit-harness-audit-radar-orchestrated-loop-report")
        ? ["The harness now runs audit evaluation as part of cycle orchestration and can floor verification by actual change surface, but the experiment still needs a durable memory write-up on what this automation changed and what broader verification depth remains intentionally out of scope."]
        : evidence.some((item) => item.evidenceId === "audit-harness-audit-radar-cycle-orchestration")
          ? ["The harness is wired to run the audit loop after cycle completion, but it does not yet have a durable orchestrated loop report proving the hook has executed on a real cycle."]
          : evidence.some((item) => item.evidenceId === "audit-harness-audit-radar-loop-report")
            ? ["A repeatable audit-loop harness command now exists and has produced durable reports, but it still requires manual invocation instead of continuous orchestration."]
            : evidence.some((item) => item.evidenceId === "audit-harness-audit-radar-loop-command")
              ? ["The harness exposes a native audit-loop command, but it does not yet have a durable run report proving the full command chain has been exercised end-to-end."]
              : ["No cited evidence yet of a repeatable audit/verification command chain wired into the harness."],
      highestLeverageNextStep: (evidence) => evidence.some((item) => item.evidenceId === "audit-harness-audit-radar-orchestrated-loop-report")
        ? "Capture the orchestration experiment in durable memory and decide whether scope-aware verification floors are predicting the right amount of follow-up or whether the harness needs a broader automated path."
        : "Wire the audit loop into cycle-runner or operator-triggered orchestration so self-evolution checks happen consistently without relying on manual choreography.",
      recommendationActionType: "tool",
      suggestedPaths: ["aies/extensions/cycle-runner/", "aies/extensions/evaluation/", "run-aies-on-pi.ps1"],
    },
  ];
}

function summarizeTier(rule: DimensionRule, tier: LayerAuditAssessment["tier"]): string {
  if (tier === "strong") {
    return rule.strongSummary;
  }
  if (tier === "partial") {
    return rule.partialSummary;
  }
  return rule.missingSummary;
}

function resolveHighestLeverageNextStep(rule: DimensionRule, evidence: AuditEvidenceItem[]): string {
  return typeof rule.highestLeverageNextStep === "function"
    ? rule.highestLeverageNextStep(evidence)
    : rule.highestLeverageNextStep;
}

function buildAssessment(rule: DimensionRule, evidence: AuditEvidenceItem[]): LayerAuditAssessment {
  const tier = conservativeTier(rule, evidence);
  const strengths = tier === "missing"
    ? []
    : uniqueStrings([
        ...rule.strengthTemplates,
        ...evidence.slice(0, 2).map(summarizeEvidence),
      ]);

  const gaps = tier === "missing"
    ? [rule.missingSummary]
    : uniqueStrings([
        ...missingRequiredEvidenceGaps(rule, evidence),
        ...rule.protocolGapChecks(evidence),
      ]);

  return {
    dimension: rule.dimension,
    tier,
    summary: summarizeTier(rule, tier),
    strengths,
    gaps,
    evidenceIds: evidence.map((item) => item.evidenceId),
    highestLeverageNextStep: resolveHighestLeverageNextStep(rule, evidence),
  };
}

function dimensionRulesByKey(): Record<AiesDimension, DimensionRule> {
  return Object.fromEntries(buildRules().map((rule) => [rule.dimension, rule])) as Record<AiesDimension, DimensionRule>;
}

export function assessAuditLayers(scan: AuditEvidenceScanResult): LayerAuditAssessment[] {
  const evidenceByDimension = new Map<AiesDimension, AuditEvidenceItem[]>();
  for (const dimension of AIES_DIMENSIONS) {
    evidenceByDimension.set(dimension, scan.evidence.filter((item) => item.dimension === dimension));
  }

  const rules = buildRules();
  return rules.map((rule) => buildAssessment(rule, evidenceByDimension.get(rule.dimension) ?? []));
}

function selectBindingConstraint(assessments: LayerAuditAssessment[]): BindingConstraintAssessment {
  const selected = [...assessments].sort((left, right) => {
    const tierDelta = tierRank(left.tier) - tierRank(right.tier);
    if (tierDelta !== 0) {
      return tierDelta;
    }
    return BINDING_CONSTRAINT_PRIORITY.indexOf(left.dimension) - BINDING_CONSTRAINT_PRIORITY.indexOf(right.dimension);
  })[0];

  if (!selected) {
    return {
      dimension: "evaluation",
      rationale: "No audit assessments were produced, so evaluation is treated as the binding constraint by default.",
      consequence: "Without usable audit output, future cycles will continue to choose work without a reliable theory-grounded compass.",
      evidenceIds: [],
    };
  }

  const rationale = selected.dimension === "evaluation"
    ? "Evaluation is the binding constraint because other layers can be partially encoded yet still fail to steer future cycles if AIES cannot compare, diagnose, and trust its own cross-layer evidence."
    : `${selected.dimension} is the binding constraint because the audit shows this layer still limits how effectively the stronger layers can translate into durable self-improvement.`;

  const consequence = selected.dimension === "evaluation"
    ? "Future work selection remains too dependent on ad-hoc judgment, making maintenance drift and flattering self-ratings harder to catch."
    : `Until ${selected.dimension} is strengthened, improvements in other layers will keep landing unevenly and the harness will continue to underperform its encoded intent.`;

  return {
    dimension: selected.dimension,
    rationale,
    consequence,
    evidenceIds: selected.evidenceIds,
  };
}

function buildFailurePatterns(assessments: LayerAuditAssessment[]): string[] {
  const byDimension = Object.fromEntries(assessments.map((assessment) => [assessment.dimension, assessment])) as Record<AiesDimension, LayerAuditAssessment>;
  const patterns: string[] = [];

  if (byDimension.evaluation?.tier !== "strong") {
    patterns.push("Cross-layer self-evaluation is still more structurally present than operationally binding, so future cycles can drift back toward ad-hoc work selection.");
  }
  if (byDimension.coherence?.tier !== "strong") {
    patterns.push("AIES can now compare audit snapshots, but coherence evidence is still thin enough that session-to-session drift detection remains provisional rather than fully trusted.");
  }
  if (byDimension.judgment?.tier !== "strong") {
    patterns.push("Judgment is better encoded as red lines and escalation boundaries than as proactive pause-and-doubt mechanisms inside execution flow.");
  }
  if (patterns.length === 0) {
    patterns.push("No dominant failure pattern was detected in the current evidence scan.");
  }

  return patterns;
}

function confidenceForSnapshot(assessments: LayerAuditAssessment[]): EvaluationConfidence {
  const missingCount = assessments.filter((assessment) => assessment.tier === "missing").length;
  const strongCount = assessments.filter((assessment) => assessment.tier === "strong").length;

  if (missingCount > 0) {
    return "low";
  }
  if (strongCount >= 5) {
    return "high";
  }
  return "medium";
}

function summarizeSnapshot(assessments: LayerAuditAssessment[], bindingConstraint: BindingConstraintAssessment): string {
  const strong = assessments.filter((assessment) => assessment.tier === "strong").map((assessment) => assessment.dimension);
  const partial = assessments.filter((assessment) => assessment.tier === "partial").map((assessment) => assessment.dimension);
  const missing = assessments.filter((assessment) => assessment.tier === "missing").map((assessment) => assessment.dimension);

  return [
    strong.length > 0 ? `Strong: ${strong.join(", ")}.` : "Strong: none.",
    partial.length > 0 ? `Partial: ${partial.join(", ")}.` : "Partial: none.",
    missing.length > 0 ? `Missing: ${missing.join(", ")}.` : "Missing: none.",
    `Current binding constraint: ${bindingConstraint.dimension}.`,
  ].join(" ");
}

function buildRecommendation(
  assessments: LayerAuditAssessment[],
  bindingConstraint: BindingConstraintAssessment,
): AuditRecommendation {
  const assessment = assessments.find((item) => item.dimension === bindingConstraint.dimension);
  const rules = dimensionRulesByKey();
  const rule = rules[bindingConstraint.dimension];

  return {
    summary: assessment?.highestLeverageNextStep ?? "Produce a durable layer-audit snapshot before choosing the next major change.",
    rationale: bindingConstraint.rationale,
    actionType: rule?.recommendationActionType ?? "other",
    targetDimensions: uniqueStrings([bindingConstraint.dimension, ...(bindingConstraint.dimension === "evaluation" ? ["coherence", "harness"] : [])]) as AiesDimension[],
    suggestedPaths: uniqueStrings(rule?.suggestedPaths ?? []),
  };
}

export function createLayerAuditSnapshot(scan: AuditEvidenceScanResult, history: LayerAuditSnapshot[] = []): LayerAuditSnapshot {
  const dimensions = assessAuditLayers(scan);
  const bindingConstraint = selectBindingConstraint(dimensions);
  const failurePatterns = buildFailurePatterns(dimensions);
  const recommendedNextStep = buildRecommendation(dimensions, bindingConstraint);

  return withAuditDrift({
    snapshotId: createSnapshotId(scan.observedAt),
    auditProtocolVersion: scan.auditProtocolVersion,
    observedAt: scan.observedAt,
    auditedPathRoots: [...scan.scannedRoots],
    summary: summarizeSnapshot(dimensions, bindingConstraint),
    dimensions,
    evidence: scan.evidence,
    bindingConstraint,
    drift: null,
    failurePatterns,
    recommendedNextStep,
    confidence: confidenceForSnapshot(dimensions),
  }, history);
}

function formatTier(tier: LayerAuditAssessment["tier"]): string {
  if (tier === "strong") {
    return "✅ strong";
  }
  if (tier === "partial") {
    return "⚠️ partial";
  }
  return "❌ missing";
}

function formatDimension(assessment: LayerAuditAssessment): string {
  return [
    `${assessment.dimension.toUpperCase()}: ${formatTier(assessment.tier)}`,
    `Summary: ${assessment.summary}`,
    `Evidence IDs: ${assessment.evidenceIds.length > 0 ? assessment.evidenceIds.join(", ") : "none"}`,
    `Strengths: ${assessment.strengths.length > 0 ? assessment.strengths.join(" | ") : "none"}`,
    `Gaps: ${assessment.gaps.length > 0 ? assessment.gaps.join(" | ") : "none"}`,
    `Next: ${assessment.highestLeverageNextStep}`,
  ].join("\n");
}

export function formatLayerAuditSnapshot(snapshot: LayerAuditSnapshot): string {
  const drift = snapshot.drift;

  return [
    `AIES layer audit @ ${snapshot.observedAt}`,
    `Snapshot: ${snapshot.snapshotId}`,
    `Protocol: ${snapshot.auditProtocolVersion}`,
    `Confidence: ${snapshot.confidence}`,
    `Summary: ${snapshot.summary}`,
    ...snapshot.dimensions.map((assessment) => formatDimension(assessment)),
    `BINDING CONSTRAINT: ${snapshot.bindingConstraint.dimension}`,
    `Rationale: ${snapshot.bindingConstraint.rationale}`,
    `Consequence: ${snapshot.bindingConstraint.consequence}`,
    `Evidence IDs: ${snapshot.bindingConstraint.evidenceIds.length > 0 ? snapshot.bindingConstraint.evidenceIds.join(", ") : "none"}`,
    "DRIFT:",
    drift
      ? `Compared to: ${drift.comparedToSnapshotId ?? "none"} @ ${drift.comparedToObservedAt ?? "n/a"}`
      : "Compared to: none",
    drift
      ? `Summary: ${drift.summary}`
      : "Summary: none",
    drift
      ? `Improved: ${drift.improvedDimensions.length > 0 ? drift.improvedDimensions.join(", ") : "none"}`
      : "Improved: none",
    drift
      ? `Regressed: ${drift.regressedDimensions.length > 0 ? drift.regressedDimensions.join(", ") : "none"}`
      : "Regressed: none",
    drift
      ? `Stagnant weak layers: ${drift.stagnantDimensions.length > 0 ? drift.stagnantDimensions.join(", ") : "none"}`
      : "Stagnant weak layers: none",
    drift
      ? `Binding constraint streak: ${drift.repeatedBindingConstraintCount}`
      : "Binding constraint streak: 0",
    drift
      ? `Maintenance-loop risk: ${drift.maintenanceLoopRisk}`
      : "Maintenance-loop risk: false",
    drift
      ? `Theory/runtime divergence: ${drift.theoryRuntimeDivergence}`
      : "Theory/runtime divergence: false",
    "Failure patterns:",
    ...snapshot.failurePatterns.map((pattern) => `- ${pattern}`),
    `Recommendation: ${snapshot.recommendedNextStep.summary}`,
    `Recommendation rationale: ${snapshot.recommendedNextStep.rationale}`,
    `Action type: ${snapshot.recommendedNextStep.actionType}`,
    `Target dimensions: ${snapshot.recommendedNextStep.targetDimensions.join(", ")}`,
    `Suggested paths: ${snapshot.recommendedNextStep.suggestedPaths.join(", ")}`,
  ].join("\n");
}
