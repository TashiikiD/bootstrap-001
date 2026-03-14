import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type {
  RecoveryReasonType,
  RecoverySeverity,
  RecoveryStatus,
  VerificationMode,
} from "../../contracts/primitives.ts";
import type { VerificationRecord } from "../../contracts/verification-record.ts";

export interface VerificationEntry {
  record: VerificationRecord;
  cycleId: string | null;
  relatedChangeId: string | null;
  createdAt: string;
  recoveryNote: string | null;
}

export interface VerificationModeEntry {
  mode: VerificationMode;
  source: "inferred" | "override";
  updatedAt: string;
}

export interface RecoveryEntry {
  recoveryId: string;
  status: RecoveryStatus;
  severity: RecoverySeverity;
  reasonType: RecoveryReasonType;
  cycleId: string | null;
  relatedChangeId: string | null;
  verificationMode: VerificationMode;
  verificationResult: VerificationRecord["result"];
  summary: string;
  recommendedNextAction: string;
  suggestedCommands: string[];
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export const VERIFICATION_ENTRY_TYPE = "aies-verification";
export const VERIFICATION_MODE_ENTRY_TYPE = "aies-verification-mode";
export const RECOVERY_ENTRY_TYPE = "aies-recovery";

function restoreLatestCustom<T>(ctx: ExtensionContext, customType: string): T | null {
  const entries = ctx.sessionManager.getEntries();
  const entry = entries
    .filter((item: { type: string; customType?: string }) => item.type === "custom" && item.customType === customType)
    .pop() as { data?: T } | undefined;

  return entry?.data ?? null;
}

function restoreCustomHistory<T>(ctx: ExtensionContext, customType: string): T[] {
  const entries = ctx.sessionManager.getEntries();
  return entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === customType)
    .map((entry: { data?: T }) => entry.data)
    .filter((entry): entry is T => Boolean(entry));
}

export function restoreVerificationEntry(ctx: ExtensionContext): VerificationEntry | null {
  return restoreLatestCustom<VerificationEntry>(ctx, VERIFICATION_ENTRY_TYPE);
}

export function restoreVerificationHistory(ctx: ExtensionContext): VerificationEntry[] {
  return restoreCustomHistory<VerificationEntry>(ctx, VERIFICATION_ENTRY_TYPE);
}

export function restoreVerificationModeEntry(ctx: ExtensionContext): VerificationModeEntry | null {
  return restoreLatestCustom<VerificationModeEntry>(ctx, VERIFICATION_MODE_ENTRY_TYPE);
}

export function restoreRecoveryEntry(ctx: ExtensionContext): RecoveryEntry | null {
  return restoreLatestCustom<RecoveryEntry>(ctx, RECOVERY_ENTRY_TYPE);
}

export function restoreRecoveryHistory(ctx: ExtensionContext): RecoveryEntry[] {
  return restoreCustomHistory<RecoveryEntry>(ctx, RECOVERY_ENTRY_TYPE);
}

export function restoreOpenRecoveryEntries(ctx: ExtensionContext): RecoveryEntry[] {
  return restoreRecoveryHistory(ctx).filter((entry) => entry.status === "open");
}
