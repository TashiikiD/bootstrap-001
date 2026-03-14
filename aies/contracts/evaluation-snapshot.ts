import type { AiesDimension, EvaluationConfidence, IsoTimestamp } from "./primitives.ts";

export interface DimensionObservation {
  dimension: AiesDimension;
  score: number | null;
  evidence: string[];
  driftNote: string | null;
}

export interface EvaluationSnapshot {
  snapshotId: string;
  observedAt: IsoTimestamp;
  dimensions: DimensionObservation[];
  neglectedDimensions: AiesDimension[];
  driftMarkers: string[];
  balanceSummary: string;
  suggestedFocus: string | null;
  recommendation: string;
  confidence: EvaluationConfidence;
}

