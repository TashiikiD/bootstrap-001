import type { FocusDecision } from "./focus-decision.ts";
import type { CyclePhase, IsoTimestamp } from "./primitives.ts";
import type { VerificationRecord } from "./verification-record.ts";

export interface CycleState {
  cycleId: string;
  sessionId: string;
  currentPhase: CyclePhase;
  selectedFocus: FocusDecision | null;
  rationale: string | null;
  activeChangeId: string | null;
  evaluationSnapshotId: string | null;
  verification: VerificationRecord | null;
  startedAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

