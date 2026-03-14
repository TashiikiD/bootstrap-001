import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { restoreOpenSpecEntry } from "../openspec/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import {
  USER_REQUEST_ENTRY_TYPE,
  appendRequest,
  applyRequestDecision,
  createRequest,
  latestOpenRequest,
  loadRequests,
  saveRequests,
  updateRequest,
  type OperatorRequestItem,
  type UserRequestCategory,
} from "./state.ts";

type HeartbeatEntry = {
  currentCycle: {
    cycleId: string;
    activeChangeId: string | null;
  } | null;
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const VALID_CATEGORIES = new Set<UserRequestCategory>(["tooling", "install", "permission", "external-agent", "resource", "other"]);

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function restoreHeartbeat(ctx: ExtensionContext): HeartbeatEntry | null {
  const entry = ctx.sessionManager.getEntries()
    .filter((candidate: { type: string; customType?: string }) => candidate.type === "custom" && candidate.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;
  return entry?.data ?? null;
}

function persistRequest(pi: ExtensionAPI, request: OperatorRequestItem): void {
  pi.appendEntry(USER_REQUEST_ENTRY_TYPE, request);
}

function parseCreateArgs(rawArgs: string): { category: UserRequestCategory; summary: string; details: string } | null {
  const parts = rawArgs.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const category = parts[0].toLowerCase() as UserRequestCategory;
  if (!VALID_CATEGORIES.has(category)) return null;
  return {
    category,
    summary: parts[1],
    details: parts.slice(2).join(" | "),
  };
}

function parseDecisionArgs(rawArgs: string): { requestId: string; comment: string | null } | null {
  const trimmed = rawArgs.trim();
  if (!trimmed) return null;
  const [requestId, ...rest] = trimmed.split(/\s+/);
  return {
    requestId,
    comment: rest.length > 0 ? rest.join(" ").trim() : null,
  };
}

function formatRequest(request: OperatorRequestItem): string {
  return [
    `Request ID: ${request.requestId}`,
    `Status: ${request.status}`,
    `Category: ${request.category}`,
    `Summary: ${request.summary}`,
    `Details: ${request.details}`,
    `Related cycle: ${request.relatedCycleId ?? "none"}`,
    `Related change: ${request.relatedChangeId ?? "none"}`,
    `Response comment: ${request.responseComment ?? "none"}`,
    `Resolution comment: ${request.resolutionComment ?? "none"}`,
    `Updated: ${request.updatedAt}`,
  ].join("\n");
}

function formatRequestList(requests: OperatorRequestItem[]): string {
  if (requests.length === 0) {
    return "No user requests recorded.";
  }
  return requests
    .slice(0, 12)
    .map((request) => `${request.requestId} | ${request.status} | ${request.category} | ${request.summary}`)
    .join("\n");
}

function updateUi(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  const requests = loadRequests();
  const openCount = requests.filter((request) => request.status === "open" || request.status === "approved").length;
  const latest = requests[0] ?? null;
  ctx.ui.setStatus(AIES_STATUS_KEYS.userRequests, ctx.ui.theme.fg(openCount > 0 ? "warning" : "accent", `req:${openCount}`));
  ctx.ui.setWidget(AIES_WIDGET_KEYS.userRequests, latest
    ? [
        `open=${openCount}`,
        `latest=${latest.requestId}`,
        `status=${latest.status}`,
        `summary=${latest.summary}`,
      ]
    : [
        "open=0",
        "latest=none",
        "status=none",
        "summary=No user requests",
      ]);
}

export default function aiesUserRequestsExtension(pi: ExtensionAPI): void {
  pi.registerCommand(AIES_COMMANDS.userRequest, {
    description: "Create an explicit agent-to-user request: /user-request <category> | <summary> | <details>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parsed = parseCreateArgs(args);
      if (!parsed) {
        writeLine(ctx, "Usage: /user-request <tooling|install|permission|external-agent|resource|other> | <summary> | <details>", "warning");
        return;
      }
      const heartbeat = restoreHeartbeat(ctx);
      const openSpec = restoreOpenSpecEntry(ctx);
      const request = createRequest({
        category: parsed.category,
        summary: parsed.summary,
        details: parsed.details,
        relatedCycleId: heartbeat?.currentCycle?.cycleId ?? null,
        relatedChangeId: openSpec?.context.activeChangeId ?? heartbeat?.currentCycle?.activeChangeId ?? null,
      });
      appendRequest(request);
      persistRequest(pi, request);
      updateUi(ctx);
      writeLine(ctx, `User request created: ${request.requestId} (${request.category})`, "info");
      if (!ctx.hasUI) {
        console.log(formatRequest(request));
      }
    },
  });

  pi.registerCommand(AIES_COMMANDS.userRequests, {
    description: "List recent agent-to-user requests",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const output = formatRequestList(loadRequests());
      updateUi(ctx);
      if (ctx.hasUI) {
        writeLine(ctx, output, "info");
        return;
      }
      console.log(output);
    },
  });

  pi.registerCommand(AIES_COMMANDS.userRequestStatus, {
    description: "Show a specific agent-to-user request",
    handler: async (args: string, ctx: ExtensionContext) => {
      const requestId = args.trim();
      if (!requestId) {
        writeLine(ctx, "Usage: /user-request-status <requestId>", "warning");
        return;
      }
      const request = loadRequests().find((candidate) => candidate.requestId === requestId);
      if (!request) {
        writeLine(ctx, `User request not found: ${requestId}`, "warning");
        return;
      }
      const output = formatRequest(request);
      updateUi(ctx);
      if (ctx.hasUI) {
        writeLine(ctx, output, "info");
        return;
      }
      console.log(output);
    },
  });

  const registerDecision = (
    commandName: string,
    nextStatus: "approved" | "denied" | "done",
    label: string,
  ) => {
    pi.registerCommand(commandName, {
      description: `${label} an agent-to-user request`,
      handler: async (args: string, ctx: ExtensionContext) => {
        const parsed = parseDecisionArgs(args);
        if (!parsed) {
          writeLine(ctx, `Usage: /${commandName} <requestId> [comment]`, "warning");
          return;
        }
        const updated = updateRequest(parsed.requestId, (request) => applyRequestDecision(request, nextStatus, parsed.comment));
        if (!updated) {
          writeLine(ctx, `User request not found: ${parsed.requestId}`, "warning");
          return;
        }
        persistRequest(pi, updated);
        updateUi(ctx);
        writeLine(ctx, `User request ${nextStatus}: ${updated.requestId}`, "info");
        if (!ctx.hasUI) {
          console.log(formatRequest(updated));
        }
      },
    });
  };

  registerDecision(AIES_COMMANDS.userRequestApprove, "approved", "Approve");
  registerDecision(AIES_COMMANDS.userRequestDeny, "denied", "Deny");
  registerDecision(AIES_COMMANDS.userRequestDone, "done", "Mark done");

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    updateUi(ctx);
  });

  pi.on("session_switch", async (_event: unknown, ctx: ExtensionContext) => {
    updateUi(ctx);
  });
}

