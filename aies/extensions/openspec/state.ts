import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { OpenSpecContext } from "../../contracts/openspec-context.ts";

export interface OpenSpecEntry {
  context: OpenSpecContext;
  title: string | null;
  summary: string | null;
  sourcePath: string | null;
  detectedAt: string;
}

export const OPENSPEC_ENTRY_TYPE = "aies-openspec";

export function restoreOpenSpecEntry(ctx: ExtensionContext): OpenSpecEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const openSpecEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === OPENSPEC_ENTRY_TYPE)
    .pop() as { data?: OpenSpecEntry } | undefined;

  return openSpecEntry?.data ?? null;
}
