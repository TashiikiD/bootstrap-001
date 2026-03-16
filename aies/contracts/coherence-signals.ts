import type { IsoTimestamp } from "./primitives.ts";

export const COHERENCE_SIGNAL_STATUSES = ["observed", "insufficient_evidence"] as const;

export type CoherenceSignalStatus = (typeof COHERENCE_SIGNAL_STATUSES)[number];

export const COHERENCE_SIGNAL_SCOPES = ["local", "global", "ambiguous"] as const;

export type CoherenceSignalScope = (typeof COHERENCE_SIGNAL_SCOPES)[number];

export const COHERENCE_SIGNAL_FAMILIES = [
  "subsystem_hotspot_concentration",
  "theory_runtime_mismatch",
  "intent_action_misalignment",
  "cross_session_contradiction",
] as const;

export type CoherenceSignalFamily = (typeof COHERENCE_SIGNAL_FAMILIES)[number];

export interface CoherenceSignalCitation {
  sourcePath: string;
  excerpt: string;
}

export interface CoherenceSignal {
  id: string;
  title: string;
  status: CoherenceSignalStatus;
  scope: CoherenceSignalScope | null;
  signalFamily: CoherenceSignalFamily;
  summary: string;
  whyItMatters: string;
  citations: CoherenceSignalCitation[];
  missingEvidence: string[];
  suggestedPaths: string[];
}

export interface CoherenceSignalSummary {
  signalCount: number;
  observedCount: number;
  insufficientEvidenceCount: number;
  scopeCounts: Record<CoherenceSignalScope, number>;
  familyCounts: Record<CoherenceSignalFamily, number>;
}

export interface CoherenceSignalReport {
  generatedAt: IsoTimestamp;
  advisoryOnly: true;
  sourceRoots: string[];
  summary: CoherenceSignalSummary;
  signals: CoherenceSignal[];
}
