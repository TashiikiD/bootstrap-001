import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CycleState } from "../../contracts/cycle-state.ts";
import type { FocusDecision } from "../../contracts/focus-decision.ts";
import { restoreOpenSpecEntry } from "../openspec/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { getAssistantText, inferFocusDecision, isAssistantMessage } from "./infer.ts";

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  completedCycles: number;
  lastPromptText: string | null;
  lastAssistantText: string | null;
  lastCompletedAt: string | null;
};

type BeforeAgentStartEvent = {
  prompt?: string;
};

type TurnStartEvent = {
  turnIndex?: number;
};

type TurnEndEvent = {
  turnIndex?: number;
  message: AgentMessage;
};

type AgentEndEvent = {
  messages: AgentMessage[];
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";

function nowIso(): string {
  return new Date().toISOString();
}

function createCycleId(): string {
  return `cycle-${Date.now()}`;
}

function getSessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionFile() ?? "ephemeral";
}

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function summarizeFocus(focus: FocusDecision | null): string {
  if (!focus) return "unknown";
  return focus.focusType.replaceAll("_", " ");
}

function buildWidgetLines(state: HeartbeatEntry): string[] {
  if (!state.currentCycle) {
    return [
      "Heartbeat active",
      `runtime=${getAiesPaths().runtimeRoot}`,
      "phase=idle",
      `completed=${state.completedCycles}`,
    ];
  }

  const focus = summarizeFocus(state.currentCycle.selectedFocus);
  const rationale = state.currentCycle.rationale ?? state.currentCycle.selectedFocus?.justification ?? "No rationale yet";

  return [
    `cycle=${state.currentCycle.cycleId}`,
    `phase=${state.currentCycle.currentPhase}`,
    `focus=${focus}`,
    `change=${state.currentCycle.activeChangeId ?? "none"}`,
    `verification=${state.currentCycle.verification ? `${state.currentCycle.verification.mode}/${state.currentCycle.verification.result}` : "none"}`,
    `rationale=${rationale}`,
    `updated=${state.currentCycle.updatedAt}`,
  ];
}

function updateUi(state: HeartbeatEntry, ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  const statusText = state.currentCycle ? `hb:${state.currentCycle.currentPhase}` : "hb:idle";
  ctx.ui.setStatus(AIES_STATUS_KEYS.heartbeat, ctx.ui.theme.fg("accent", statusText));
  ctx.ui.setWidget(AIES_WIDGET_KEYS.heartbeat, buildWidgetLines(state));
}

function persistState(pi: ExtensionAPI, state: HeartbeatEntry): void {
  pi.appendEntry(HEARTBEAT_ENTRY_TYPE, state);
}

function restoreState(ctx: ExtensionContext): HeartbeatEntry {
  const fallback: HeartbeatEntry = {
    currentCycle: null,
    completedCycles: 0,
    lastPromptText: null,
    lastAssistantText: null,
    lastCompletedAt: null,
  };

  const entries = ctx.sessionManager.getEntries();
  const heartbeatEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  return heartbeatEntry?.data ?? fallback;
}

function beginCycle(state: HeartbeatEntry, promptText: string, sessionId: string, activeChangeId: string | null): HeartbeatEntry {
  const startedAt = nowIso();
  return {
    ...state,
    currentCycle: {
      cycleId: createCycleId(),
      sessionId,
      currentPhase: "wake_inspect",
      selectedFocus: null,
      rationale: null,
      activeChangeId,
      evaluationSnapshotId: null,
      verification: null,
      startedAt,
      updatedAt: startedAt,
    },
    lastPromptText: promptText.trim() || null,
  };
}

function advancePhase(state: HeartbeatEntry, phase: CycleState["currentPhase"]): HeartbeatEntry {
  if (!state.currentCycle) return state;
  return {
    ...state,
    currentCycle: {
      ...state.currentCycle,
      currentPhase: phase,
      updatedAt: nowIso(),
    },
  };
}

function updateFocus(state: HeartbeatEntry, assistantText: string): HeartbeatEntry {
  if (!state.currentCycle) return state;
  const decidedAt = nowIso();
  const focusDecision = inferFocusDecision(state.lastPromptText ?? "", assistantText, decidedAt);

  return {
    ...state,
    lastAssistantText: assistantText || null,
    currentCycle: {
      ...state.currentCycle,
      currentPhase: "reflect_log",
      selectedFocus: focusDecision,
      rationale: focusDecision.justification,
      updatedAt: decidedAt,
    },
  };
}

function maybeNameSession(pi: ExtensionAPI, state: HeartbeatEntry): void {
  const cycle = state.currentCycle;
  if (!cycle || !cycle.selectedFocus || !cycle.rationale) {
    return;
  }

  if (cycle.selectedFocus.focusType === "other") {
    return;
  }

  const currentName = pi.getSessionName();
  const nextName = `${summarizeFocus(cycle.selectedFocus)} - ${cycle.rationale}`;
  if (currentName !== nextName) {
    pi.setSessionName(nextName);
  }
}

function finalizeCycle(state: HeartbeatEntry): HeartbeatEntry {
  if (!state.currentCycle) return state;
  return {
    ...state,
    currentCycle: {
      ...state.currentCycle,
      currentPhase: "publish_state",
      updatedAt: nowIso(),
    },
    completedCycles: state.completedCycles + 1,
    lastCompletedAt: nowIso(),
  };
}

function formatStatusLines(state: HeartbeatEntry): string[] {
  if (!state.currentCycle) {
    return [
      "Heartbeat state: idle",
      `Completed cycles: ${state.completedCycles}`,
      `Runtime root: ${getAiesPaths().runtimeRoot}`,
    ];
  }

  return [
    `Cycle ID: ${state.currentCycle.cycleId}`,
    `Phase: ${state.currentCycle.currentPhase}`,
    `Focus: ${summarizeFocus(state.currentCycle.selectedFocus)}`,
    `Active change: ${state.currentCycle.activeChangeId ?? "none"}`,
    `Verification: ${state.currentCycle.verification ? `${state.currentCycle.verification.mode}/${state.currentCycle.verification.result}` : "none"}`,
    `Rationale: ${state.currentCycle.rationale ?? "No rationale yet"}`,
    `Completed cycles: ${state.completedCycles}`,
    `Session: ${state.currentCycle.sessionId}`,
    `Updated: ${state.currentCycle.updatedAt}`,
  ];
}

function latestAssistantMessage(messages: AgentMessage[]): AssistantMessage | undefined {
  return [...messages].reverse().find(isAssistantMessage);
}

export default function aiesHeartbeatExtension(pi: ExtensionAPI): void {
  let state: HeartbeatEntry = {
    currentCycle: null,
    completedCycles: 0,
    lastPromptText: null,
    lastAssistantText: null,
    lastCompletedAt: null,
  };

  pi.registerCommand(AIES_COMMANDS.heartbeatStatus, {
    description: "Show current AIES heartbeat cycle status",
    handler: async (_args, ctx) => {
      updateUi(state, ctx);
      writeLine(ctx, formatStatusLines(state).join("\n"));
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    state = restoreState(ctx);
    updateUi(state, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    state = restoreState(ctx);
    updateUi(state, ctx);
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    const openSpecEntry = restoreOpenSpecEntry(ctx);
    state = beginCycle(state, event.prompt ?? "", getSessionId(ctx), openSpecEntry?.context.activeChangeId ?? null);
    state = advancePhase(state, "evaluate_orient");
    persistState(pi, state);
    updateUi(state, ctx);
    return undefined;
  });

  pi.on("turn_start", async (_event: TurnStartEvent, ctx) => {
    state = advancePhase(state, "implement");
    persistState(pi, state);
    updateUi(state, ctx);
  });

  pi.on("turn_end", async (event: TurnEndEvent, ctx) => {
    if (!isAssistantMessage(event.message)) {
      state = advancePhase(state, "reflect_log");
      persistState(pi, state);
      updateUi(state, ctx);
      return;
    }

    const assistantText = getAssistantText(event.message);
    state = updateFocus(state, assistantText);
    persistState(pi, state);
    updateUi(state, ctx);
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    const assistant = latestAssistantMessage(event.messages);
    if (assistant) {
      state = updateFocus(state, getAssistantText(assistant));
    }

    state = finalizeCycle(state);
    maybeNameSession(pi, state);
    persistState(pi, state);
    updateUi(state, ctx);
  });
}
