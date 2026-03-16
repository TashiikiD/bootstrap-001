import type { AiesDimension, IsoTimestamp, VerificationMode } from "./primitives.ts";

export const THEORY_QUESTION_SOURCE_KINDS = ["index", "layer", "meta"] as const;

export type TheoryQuestionSourceKind = (typeof THEORY_QUESTION_SOURCE_KINDS)[number];

export const THEORY_EXPERIMENT_SHAPES = ["tool", "skill", "runtime_module", "openspec_plan", "theory_update"] as const;

export type TheoryExperimentShape = (typeof THEORY_EXPERIMENT_SHAPES)[number];

export const THEORY_EXPERIMENT_RISK_LEVELS = ["low", "medium", "high"] as const;

export type TheoryExperimentRiskLevel = (typeof THEORY_EXPERIMENT_RISK_LEVELS)[number];

export type TheoryExperimentVerificationFloor = VerificationMode | "docs_only";

export interface TheoryQuestionCitation {
  sourcePath: string;
  excerpt: string;
}

export interface TheoryQuestionEntry {
  id: string;
  question: string;
  sourcePath: string;
  sourceTitle: string;
  sourceKind: TheoryQuestionSourceKind;
  dimensionHints: AiesDimension[];
  suggestedPaths: string[];
  ambiguityFlags: string[];
  citations: TheoryQuestionCitation[];
}

export interface TheoryExperimentCandidate {
  id: string;
  questionId: string;
  title: string;
  summary: string;
  whyNow: string;
  dimensionHints: AiesDimension[];
  experimentShape: TheoryExperimentShape;
  suggestedPaths: string[];
  expectedRisk: TheoryExperimentRiskLevel;
  minimumVerificationFloor: TheoryExperimentVerificationFloor;
  breadthSignals: string[];
  citations: TheoryQuestionCitation[];
}

export interface TheoryQuestionLabSummary {
  sourceCount: number;
  questionCount: number;
  candidateCount: number;
  ambiguousQuestionCount: number;
  questionCountsByDimension: Record<AiesDimension, number>;
}

export interface TheoryQuestionLabReport {
  generatedAt: IsoTimestamp;
  advisoryOnly: true;
  sourceRoot: string;
  summary: TheoryQuestionLabSummary;
  questions: TheoryQuestionEntry[];
  candidates: TheoryExperimentCandidate[];
}
