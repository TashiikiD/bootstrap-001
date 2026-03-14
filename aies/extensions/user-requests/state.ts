import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getAiesPaths } from "../shared/paths.ts";

type SessionContextLike = {
  sessionManager: {
    getEntries(): Array<{ type: string; customType?: string; data?: Partial<OperatorRequestItem> }>;
  };
};

export type UserRequestStatus = "open" | "approved" | "denied" | "done";
export type UserRequestCategory = "tooling" | "install" | "permission" | "external-agent" | "resource" | "other";
export type UserRequestActor = "agent" | "operator";
export type UserRequestEventKind = "created" | "approved" | "denied" | "done";

export interface UserRequestHistoryEntry {
  eventId: string;
  kind: UserRequestEventKind;
  actor: UserRequestActor;
  timestamp: string;
  comment: string | null;
}

export interface OperatorRequestItem {
  requestId: string;
  status: UserRequestStatus;
  category: UserRequestCategory;
  summary: string;
  details: string;
  requestedBy: "agent";
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  createdAt: string;
  updatedAt: string;
  responseComment: string | null;
  resolutionComment: string | null;
  history: UserRequestHistoryEntry[];
}

export const USER_REQUEST_ENTRY_TYPE = "aies-user-request";

function nowIso(): string {
  return new Date().toISOString();
}

function createEventId(): string {
  return `request-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRequestId(): string {
  return `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRequestsFilePath(): string {
  const paths = getAiesPaths();
  return resolve(paths.runtimeRoot, "operator-ui", "requests.json");
}

function ensureRequestsFile(): void {
  const filePath = getRequestsFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n", "utf8");
  }
}

function normalizeHistoryEntry(entry: Partial<UserRequestHistoryEntry> | undefined): UserRequestHistoryEntry | null {
  if (!entry?.eventId || !entry.kind || !entry.actor || !entry.timestamp) {
    return null;
  }
  return {
    eventId: entry.eventId,
    kind: entry.kind,
    actor: entry.actor,
    timestamp: entry.timestamp,
    comment: entry.comment ?? null,
  };
}

function normalizeRequest(entry: Partial<OperatorRequestItem> | undefined): OperatorRequestItem | null {
  if (!entry?.requestId || !entry.status || !entry.category || !entry.summary || !entry.details || !entry.createdAt) {
    return null;
  }
  return {
    requestId: entry.requestId,
    status: entry.status,
    category: entry.category,
    summary: entry.summary,
    details: entry.details,
    requestedBy: "agent",
    relatedCycleId: entry.relatedCycleId ?? null,
    relatedChangeId: entry.relatedChangeId ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt ?? entry.createdAt,
    responseComment: entry.responseComment ?? null,
    resolutionComment: entry.resolutionComment ?? null,
    history: Array.isArray(entry.history)
      ? entry.history.map((historyEntry) => normalizeHistoryEntry(historyEntry)).filter((historyEntry): historyEntry is UserRequestHistoryEntry => Boolean(historyEntry))
      : [],
  };
}

export function loadRequests(): OperatorRequestItem[] {
  ensureRequestsFile();
  const parsed = JSON.parse(readFileSync(getRequestsFilePath(), "utf8")) as Array<Partial<OperatorRequestItem>>;
  return parsed
    .map((entry) => normalizeRequest(entry))
    .filter((entry): entry is OperatorRequestItem => Boolean(entry))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function saveRequests(requests: OperatorRequestItem[]): void {
  ensureRequestsFile();
  writeFileSync(getRequestsFilePath(), `${JSON.stringify(requests, null, 2)}\n`, "utf8");
}

export function appendRequest(request: OperatorRequestItem): void {
  const requests = loadRequests();
  requests.unshift(request);
  saveRequests(requests.slice(0, 500));
}

export function updateRequest(
  requestId: string,
  mutator: (request: OperatorRequestItem) => OperatorRequestItem,
): OperatorRequestItem | null {
  const requests = loadRequests();
  const index = requests.findIndex((request) => request.requestId === requestId);
  if (index === -1) return null;
  requests[index] = mutator(requests[index]);
  saveRequests(requests);
  return requests[index];
}

export function createRequest(input: {
  category: UserRequestCategory;
  summary: string;
  details: string;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
}): OperatorRequestItem {
  const timestamp = nowIso();
  return {
    requestId: createRequestId(),
    status: "open",
    category: input.category,
    summary: input.summary,
    details: input.details,
    requestedBy: "agent",
    relatedCycleId: input.relatedCycleId,
    relatedChangeId: input.relatedChangeId,
    createdAt: timestamp,
    updatedAt: timestamp,
    responseComment: null,
    resolutionComment: null,
    history: [
      {
        eventId: createEventId(),
        kind: "created",
        actor: "agent",
        timestamp,
        comment: null,
      },
    ],
  };
}

export function applyRequestDecision(
  request: OperatorRequestItem,
  status: Extract<UserRequestStatus, "approved" | "denied" | "done">,
  comment: string | null,
): OperatorRequestItem {
  const timestamp = nowIso();
  return {
    ...request,
    status,
    updatedAt: timestamp,
    responseComment: status === "done" ? request.responseComment : comment,
    resolutionComment: status === "done" ? comment : request.resolutionComment,
    history: [
      ...request.history,
      {
        eventId: createEventId(),
        kind: status,
        actor: "operator",
        timestamp,
        comment,
      },
    ],
  };
}

export function summarizeRequestsForPrompt(limit = 4): string[] {
  const requests = loadRequests();
  const openLike = requests.filter((request) => request.status === "open" || request.status === "approved").slice(0, limit);
  const recentResolved = requests
    .filter((request) => request.status === "denied" || request.status === "done")
    .slice(0, limit);

  if (openLike.length === 0 && recentResolved.length === 0) {
    return ["User requests: none"];
  }

  const lines: string[] = [];
  if (openLike.length > 0) {
    lines.push("Open user requests:");
    for (const request of openLike) {
      lines.push(`- ${request.requestId} | ${request.status} | ${request.category} | ${request.summary}`);
    }
  } else {
    lines.push("Open user requests: none");
  }

  if (recentResolved.length > 0) {
    lines.push("Recent operator decisions:");
    for (const request of recentResolved) {
      const comment = request.status === "done" ? request.resolutionComment : request.responseComment;
      lines.push(`- ${request.requestId} | ${request.status} | ${request.summary}${comment ? ` | ${comment}` : ""}`);
    }
  }

  return lines;
}

export function latestRequest(): OperatorRequestItem | null {
  return loadRequests()[0] ?? null;
}

export function latestOpenRequest(): OperatorRequestItem | null {
  return loadRequests().find((request) => request.status === "open" || request.status === "approved") ?? null;
}

export function restoreRequestEntries(ctx: SessionContextLike): OperatorRequestItem[] {
  return ctx.sessionManager.getEntries()
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === USER_REQUEST_ENTRY_TYPE)
    .map((entry) => normalizeRequest(entry.data))
    .filter((entry): entry is OperatorRequestItem => Boolean(entry));
}
