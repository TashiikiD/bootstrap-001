import type { IsoTimestamp, VerificationMode, VerificationResult, VerificationState } from "./primitives.ts";

export interface VerificationRecord {
  recordId: string;
  mode: VerificationMode;
  commands: string[];
  result: VerificationResult;
  verificationState: VerificationState;
  suggestedCommands: string[];
  planSummary: string | null;
  notableFailures: string[];
  followUpRequired: boolean;
  recordedAt: IsoTimestamp;
}
