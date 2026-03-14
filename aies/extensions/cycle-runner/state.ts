import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export type CycleRunStatus = "idle" | "requested" | "running" | "completed" | "blocked" | "aborted" | "failed";
export type CycleRunTriggerSource = "slash_command" | "operator_ui";

export interface CycleRunEntry {
  runId: string;
  status: CycleRunStatus;
  triggerSource: CycleRunTriggerSource;
  sessionId: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  promptSummary: string;
  startedAt: string;
  finishedAt: string | null;
  failureNote: string | null;
}

export const CYCLE_RUN_ENTRY_TYPE = "aies-cycle-run";

export function restoreCycleRunEntry(ctx: ExtensionContext): CycleRunEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const runEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === CYCLE_RUN_ENTRY_TYPE)
    .pop() as { data?: CycleRunEntry } | undefined;

  return runEntry?.data ?? null;
}
