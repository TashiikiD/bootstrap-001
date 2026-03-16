import type {
  EvolutionEvidenceIndex,
  EvolutionEvidenceNode,
  EvolutionEvidenceQuery,
  EvolutionEvidenceQueryResult,
} from "../../contracts/evolution-evidence-index.ts";
import type { AiesDimension } from "../../contracts/primitives.ts";
import { queryEvolutionEvidenceIndex } from "./evolution-evidence-index.ts";

export const EVOLUTION_EVIDENCE_PRESET_IDS = [
  "recent_evaluation_interventions",
  "binding_constraint_support",
  "harness_verification_threads",
] as const;

export type EvolutionEvidencePresetId = (typeof EVOLUTION_EVIDENCE_PRESET_IDS)[number];

export interface EvolutionEvidenceBrief {
  presetId: EvolutionEvidencePresetId;
  title: string;
  summary: string;
  query: EvolutionEvidenceQuery;
  uncertainty: string | null;
  relationCount: number;
  nodes: Array<{
    id: string;
    artifactType: string;
    title: string;
    sourcePath: string;
    createdAt: string | null;
    summary: string;
    citations: Array<{ sourcePath: string; excerpt: string }>;
  }>;
}

function compact(text: string | null | undefined, maxLength = 220): string {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "none";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function latestAuditSnapshot(index: EvolutionEvidenceIndex): EvolutionEvidenceNode | null {
  return index.nodes
    .filter((node) => node.artifactType === "audit_snapshot")
    .slice()
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))[0] ?? null;
}

function nodeView(node: EvolutionEvidenceNode): EvolutionEvidenceBrief["nodes"][number] {
  return {
    id: node.id,
    artifactType: node.artifactType,
    title: node.title,
    sourcePath: node.sourcePath,
    createdAt: node.createdAt,
    summary: node.summary,
    citations: node.citations.slice(0, 2),
  };
}

function summarizeResult(result: EvolutionEvidenceQueryResult, dimensionLabel: string | null, fallback: string): string {
  if (result.nodes.length === 0) {
    return fallback;
  }

  const latest = result.nodes[0];
  const dimensionText = dimensionLabel ? ` for ${dimensionLabel}` : "";
  return compact(`Matched ${result.nodes.length} cited artifacts and ${result.relations.length} relations${dimensionText}. Most recent evidence: ${latest.artifactType} ${latest.title} from ${latest.sourcePath}.`);
}

function buildRecentInterventionsBrief(index: EvolutionEvidenceIndex, dimension: AiesDimension): EvolutionEvidenceBrief {
  const query: EvolutionEvidenceQuery = {
    dimensions: [dimension],
    maxNodes: 6,
  };
  const result = queryEvolutionEvidenceIndex(index, query);

  return {
    presetId: "recent_evaluation_interventions",
    title: "Recent evaluation interventions",
    summary: summarizeResult(result, dimension, "No recent evaluation evidence matched the current bounded query."),
    query,
    uncertainty: result.nodes.length === 0 ? "No cited artifacts matched the requested evaluation slice." : null,
    relationCount: result.relations.length,
    nodes: result.nodes.map(nodeView),
  };
}

function buildBindingConstraintSupportBrief(index: EvolutionEvidenceIndex): EvolutionEvidenceBrief {
  const latestSnapshot = latestAuditSnapshot(index);
  const bindingConstraint = (latestSnapshot?.metadata.bindingConstraint ?? null) as AiesDimension | null;
  const query: EvolutionEvidenceQuery = {
    dimensions: bindingConstraint ? [bindingConstraint] : [],
    artifactTypes: [
      "audit_snapshot",
      "audit_outcome",
      "audit_loop",
      "guidance_outcome",
      "guidance_effectiveness",
      "guidance_adaptation",
      "openspec_change",
      "devlog",
    ],
    maxNodes: 6,
  };
  const result = queryEvolutionEvidenceIndex(index, query);

  return {
    presetId: "binding_constraint_support",
    title: "Evidence supporting the current binding constraint",
    summary: summarizeResult(
      result,
      bindingConstraint,
      "No indexed evidence could be assembled for the latest binding constraint.",
    ),
    query,
    uncertainty: bindingConstraint
      ? (result.nodes.length === 0 ? `The latest snapshot names ${bindingConstraint}, but the bounded query returned no supporting artifacts.` : null)
      : "The latest audit snapshot did not expose a binding constraint in the current index.",
    relationCount: result.relations.length,
    nodes: result.nodes.map(nodeView),
  };
}

function buildHarnessVerificationBrief(index: EvolutionEvidenceIndex): EvolutionEvidenceBrief {
  const query: EvolutionEvidenceQuery = {
    dimensions: ["harness"],
    text: "verif",
    artifactTypes: ["audit_loop", "openspec_change", "devlog", "guidance_effectiveness", "guidance_adaptation"],
    maxNodes: 6,
  };
  const result = queryEvolutionEvidenceIndex(index, query);

  return {
    presetId: "harness_verification_threads",
    title: "Harness verification threads",
    summary: summarizeResult(result, "harness", "No harness verification thread matched the current bounded query."),
    query,
    uncertainty: result.nodes.length === 0
      ? "Verification-related harness evidence is still sparse or not captured by the current curated corpus."
      : null,
    relationCount: result.relations.length,
    nodes: result.nodes.map(nodeView),
  };
}

export function buildEvolutionEvidenceBrief(index: EvolutionEvidenceIndex, presetId: EvolutionEvidencePresetId): EvolutionEvidenceBrief {
  switch (presetId) {
    case "recent_evaluation_interventions":
      return buildRecentInterventionsBrief(index, "evaluation");
    case "binding_constraint_support":
      return buildBindingConstraintSupportBrief(index);
    case "harness_verification_threads":
      return buildHarnessVerificationBrief(index);
    default:
      return buildRecentInterventionsBrief(index, "evaluation");
  }
}

export function buildEvolutionEvidenceBriefs(index: EvolutionEvidenceIndex): EvolutionEvidenceBrief[] {
  return EVOLUTION_EVIDENCE_PRESET_IDS.map((presetId) => buildEvolutionEvidenceBrief(index, presetId));
}
