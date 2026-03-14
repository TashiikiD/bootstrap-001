import type { IsoTimestamp, MemoryEventKind, MemorySensitivity, MemoryTarget } from "./primitives.ts";

export interface MemoryEvent {
  eventId: string;
  kind: MemoryEventKind;
  summary: string;
  sourceEvidence: string[];
  persistenceTarget: MemoryTarget;
  sensitivity: MemorySensitivity;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  createdAt: IsoTimestamp;
}

