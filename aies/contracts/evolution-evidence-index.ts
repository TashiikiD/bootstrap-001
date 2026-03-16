import type { AiesDimension, IsoTimestamp } from "./primitives.ts";

export const EVOLUTION_EVIDENCE_ARTIFACT_TYPES = [
  "dimension_anchor",
  "path_anchor",
  "openspec_change",
  "devlog",
  "knowledge_decision",
  "theory_note",
  "audit_snapshot",
  "audit_outcome",
  "audit_loop",
  "guidance_outcome",
  "guidance_effectiveness",
  "guidance_adaptation",
] as const;

export type EvolutionEvidenceArtifactType = (typeof EVOLUTION_EVIDENCE_ARTIFACT_TYPES)[number];

export const EVOLUTION_EVIDENCE_RELATION_TYPES = [
  "targets_dimension",
  "continues_change",
  "records_observation",
  "references_snapshot",
  "touches_path",
  "verifies_surface",
  "updates_theory",
] as const;

export type EvolutionEvidenceRelationType = (typeof EVOLUTION_EVIDENCE_RELATION_TYPES)[number];

export const EVOLUTION_EVIDENCE_CONFIDENCE_LEVELS = ["direct", "heuristic"] as const;

export type EvolutionEvidenceConfidence = (typeof EVOLUTION_EVIDENCE_CONFIDENCE_LEVELS)[number];

export interface EvolutionEvidenceCitation {
  sourcePath: string;
  excerpt: string;
}

export interface EvolutionEvidenceNode {
  id: string;
  artifactType: EvolutionEvidenceArtifactType;
  title: string;
  summary: string;
  createdAt: IsoTimestamp | null;
  sourcePath: string;
  changeId: string | null;
  dimensionHints: AiesDimension[];
  tags: string[];
  citations: EvolutionEvidenceCitation[];
  metadata: Record<string, string | number | boolean | null | string[]>;
}

export interface EvolutionEvidenceRelation {
  id: string;
  type: EvolutionEvidenceRelationType;
  fromId: string;
  toId: string;
  confidence: EvolutionEvidenceConfidence;
  rationale: string;
  citations: EvolutionEvidenceCitation[];
}

export interface EvolutionEvidenceIndexSummary {
  nodeCount: number;
  relationCount: number;
  artifactCounts: Record<EvolutionEvidenceArtifactType, number>;
}

export interface EvolutionEvidenceIndex {
  generatedAt: IsoTimestamp;
  advisoryOnly: true;
  sourceRoots: string[];
  summary: EvolutionEvidenceIndexSummary;
  nodes: EvolutionEvidenceNode[];
  relations: EvolutionEvidenceRelation[];
}

export interface EvolutionEvidenceQuery {
  dimensions?: AiesDimension[];
  changeIds?: string[];
  artifactTypes?: EvolutionEvidenceArtifactType[];
  text?: string;
  maxNodes?: number;
}

export interface EvolutionEvidenceQueryResult {
  query: EvolutionEvidenceQuery;
  nodes: EvolutionEvidenceNode[];
  relations: EvolutionEvidenceRelation[];
}
