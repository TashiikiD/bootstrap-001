import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { EvaluationSnapshot } from "../../contracts/evaluation-snapshot.ts";

export interface EvaluationEntry {
  snapshot: EvaluationSnapshot;
  cycleId: string | null;
  relatedChangeId: string | null;
  createdAt: string;
}

export const EVALUATION_ENTRY_TYPE = "aies-evaluation";

export function restoreEvaluationEntry(ctx: ExtensionContext): EvaluationEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const evaluationEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === EVALUATION_ENTRY_TYPE)
    .pop() as { data?: EvaluationEntry } | undefined;

  return evaluationEntry?.data ?? null;
}

export function restoreEvaluationHistory(ctx: ExtensionContext): EvaluationEntry[] {
  const entries = ctx.sessionManager.getEntries();
  return entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === EVALUATION_ENTRY_TYPE)
    .map((entry: { data?: EvaluationEntry }) => entry.data)
    .filter((entry): entry is EvaluationEntry => Boolean(entry));
}
