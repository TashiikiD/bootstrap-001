import type { AiesDimension, FocusType, IsoTimestamp } from "./primitives.ts";

export interface FocusDecision {
  focusType: FocusType;
  justification: string;
  linkedDimensions: AiesDimension[];
  linkedChangeId: string | null;
  alternativesConsidered: string[];
  decidedAt: IsoTimestamp;
}

