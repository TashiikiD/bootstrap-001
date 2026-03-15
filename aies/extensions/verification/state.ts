import { existsSync, readFileSync } from "node:fs";
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
  source: "inferred" | "override" | "aligned_operator";
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

type CustomSessionEntry<T> = {
  type?: string;
  customType?: string;
  data?: T;
  timestamp?: string;
};

type CustomSnapshot<T> = {
  data: T;
  timestamp: string | null;
};

function restoreLatestCustom<T>(ctx: ExtensionContext, customType: string): T | null {
  const entries = ctx.sessionManager.getEntries();
  const entry = entries
    .filter((item: { type: string; customType?: string }) => item.type === "custom" && item.customType === customType)
    .pop() as { data?: T } | undefined;

  return entry?.data ?? null;
}

function restoreLatestCustomSnapshot<T>(ctx: ExtensionContext, customType: string): CustomSnapshot<T> | null {
  const entries = ctx.sessionManager.getEntries();
  const entry = entries
    .filter((item: { type: string; customType?: string }) => item.type === "custom" && item.customType === customType)
    .pop() as CustomSessionEntry<T> | undefined;

  if (!entry?.data) {
    return null;
  }

  return {
    data: entry.data,
    timestamp: typeof entry.timestamp === "string" ? entry.timestamp : null,
  };
}

function restoreLatestCustomSnapshotFromSessionFile<T>(ctx: ExtensionContext, customType: string): CustomSnapshot<T> | null {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile || !existsSync(sessionFile)) {
    return null;
  }

  const lines = readFileSync(sessionFile, "utf8").split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }

    try {
      const entry = JSON.parse(line) as CustomSessionEntry<T>;
      if (entry.type === "custom" && entry.customType === customType && entry.data) {
        return {
          data: entry.data,
          timestamp: typeof entry.timestamp === "string" ? entry.timestamp : null,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chooseLatestSnapshot<T>(left: CustomSnapshot<T> | null, right: CustomSnapshot<T> | null): CustomSnapshot<T> | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const leftTime = parseTimestamp(left.timestamp);
  const rightTime = parseTimestamp(right.timestamp);
  if (leftTime !== null && rightTime !== null) {
    return rightTime > leftTime ? right : left;
  }

  return rightTime !== null ? right : left;
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
  return chooseLatestSnapshot(
    restoreLatestCustomSnapshot<VerificationModeEntry>(ctx, VERIFICATION_MODE_ENTRY_TYPE),
    restoreLatestCustomSnapshotFromSessionFile<VerificationModeEntry>(ctx, VERIFICATION_MODE_ENTRY_TYPE),
  )?.data ?? null;
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
