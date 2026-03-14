import type { IsoTimestamp } from "./primitives.ts";

export interface OpenSpecContext {
  rootPath: string;
  activeChangeId: string | null;
  currentTaskId: string | null;
  pendingTaskIds: string[];
  blocked: boolean;
  blockedReasons: string[];
  isStale: boolean;
  lastUpdatedAt: IsoTimestamp | null;
}

