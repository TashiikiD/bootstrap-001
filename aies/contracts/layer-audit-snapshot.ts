import type { AiesDimension, EvaluationConfidence, IsoTimestamp } from "./primitives.ts";

export const AIES_AUDIT_TIERS = ["strong", "partial", "missing"] as const;

export type AiesAuditTier = (typeof AIES_AUDIT_TIERS)[number];

export const AIES_AUDIT_EVIDENCE_SOURCE_TYPES = [
  "file",
  "directory",
  "session_entry",
  "operator_surface",
  "memory_note",
  "command_output",
  "other",
] as const;

export type AiesAuditEvidenceSourceType = (typeof AIES_AUDIT_EVIDENCE_SOURCE_TYPES)[number];

export const AIES_AUDIT_RECOMMENDED_ACTION_TYPES = [
  "openspec_change",
  "tool",
  "extension",
  "memory_update",
  "operator_request",
  "theory_experiment",
  "other",
] as const;

export type AiesAuditRecommendedActionType = (typeof AIES_AUDIT_RECOMMENDED_ACTION_TYPES)[number];

export interface AuditEvidenceItem {
  evidenceId: string;
  dimension: AiesDimension;
  summary: string;
  sourceType: AiesAuditEvidenceSourceType;
  sourcePath: string | null;
  excerpt: string | null;
  observedAt: IsoTimestamp;
}

export interface LayerAuditAssessment {
  dimension: AiesDimension;
  tier: AiesAuditTier;
  summary: string;
  strengths: string[];
  gaps: string[];
  evidenceIds: string[];
  highestLeverageNextStep: string;
}

export interface BindingConstraintAssessment {
  dimension: AiesDimension;
  rationale: string;
  consequence: string;
  evidenceIds: string[];
}

export interface AuditRecommendation {
  summary: string;
  rationale: string;
  actionType: AiesAuditRecommendedActionType;
  targetDimensions: AiesDimension[];
  suggestedPaths: string[];
}

export interface LayerAuditSnapshot {
  snapshotId: string;
  auditProtocolVersion: string;
  observedAt: IsoTimestamp;
  auditedPathRoots: string[];
  summary: string;
  dimensions: LayerAuditAssessment[];
  evidence: AuditEvidenceItem[];
  bindingConstraint: BindingConstraintAssessment;
  failurePatterns: string[];
  recommendedNextStep: AuditRecommendation;
  confidence: EvaluationConfidence;
}
