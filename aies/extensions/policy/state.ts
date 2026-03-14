import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { PolicyMode } from "./types.ts";

export interface PolicyModeEntry {
  mode: PolicyMode;
  updatedAt: string;
}

export const POLICY_MODE_ENTRY_TYPE = "aies-policy-mode";

export function restorePolicyModeEntry(ctx: ExtensionContext): PolicyModeEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const modeEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === POLICY_MODE_ENTRY_TYPE)
    .pop() as { data?: PolicyModeEntry } | undefined;

  return modeEntry?.data ?? null;
}
