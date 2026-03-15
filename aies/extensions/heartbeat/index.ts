import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CycleState } from "../../contracts/cycle-state.ts";
import type { FocusDecision } from "../../contracts/focus-decision.ts";
import { runCycleCommand } from "../cycle-runner/index.ts";
import { restoreOpenSpecEntry } from "../openspec/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { getAssistantText, inferFocusDecision, isAssistantMessage } from "./infer.ts";

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  lastCycle: CycleState | null;
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

type HeartbeatControlState = {
  enabled: boolean;
  continuousMode: boolean;
  intervalMs: number;
  lastTriggerPrompt: string | null;
};

type OperatorControlState = {
  activeSessionPath: string | null;
  sessionSelectionMode: "auto" | "manual";
  heartbeat: HeartbeatControlState;
  provider?: unknown;
  policy?: unknown;
  verification?: unknown;
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const HEARTBEAT_MIN_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 300_000;
const CONTINUOUS_RESTART_DELAY_MS = 5000;
const HEARTBEAT_TRIGGER_ARGS = "--source heartbeat_tui";
const CONTINUOUS_COMPACTION_INSTRUCTIONS =
  "Compact the session before the next AIES cycle. Preserve the latest cycle outcome, active change context, operator automation state, verification posture, and the most concrete next-step continuity needed for the upcoming cycle.";
const controlsFile = resolve(getAiesPaths().runtimeRoot, "operator-ui", "controls.json");

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

function formatIntervalMs(intervalMs: number): string {
  if (intervalMs % 3_600_000 === 0) {
    return `${intervalMs / 3_600_000}h`;
  }
  if (intervalMs % 60_000 === 0) {
    return `${intervalMs / 60_000}m`;
  }
  if (intervalMs % 1000 === 0) {
    return `${intervalMs / 1000}s`;
  }
  return `${intervalMs}ms`;
}

function defaultHeartbeatControls(): HeartbeatControlState {
  return {
    enabled: true,
    continuousMode: false,
    intervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    lastTriggerPrompt: null,
  };
}

function defaultOperatorControls(): OperatorControlState {
  return {
    activeSessionPath: null,
    sessionSelectionMode: "auto",
    heartbeat: defaultHeartbeatControls(),
  };
}

function normalizeIntervalMs(value: unknown, fallback = DEFAULT_HEARTBEAT_INTERVAL_MS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(HEARTBEAT_MIN_INTERVAL_MS, Math.trunc(parsed));
}

function parseCadenceMs(rawValue: string): number | null {
  const trimmed = rawValue.trim().toLowerCase();
  if (!trimmed) return null;
  const match = /^(\d+(?:\.\d+)?)(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2] ?? "s";
  const multiplier =
    unit === "ms"
      ? 1
      : ["s", "sec", "secs", "second", "seconds"].includes(unit)
        ? 1000
        : ["m", "min", "mins", "minute", "minutes"].includes(unit)
          ? 60_000
          : ["h", "hr", "hrs", "hour", "hours"].includes(unit)
            ? 3_600_000
            : null;

  if (!multiplier) {
    return null;
  }

  return normalizeIntervalMs(amount * multiplier);
}

function ensureControlsFile(): void {
  const directory = resolve(controlsFile, "..");
  mkdirSync(directory, { recursive: true });
  if (!existsSync(controlsFile)) {
    writeFileSync(controlsFile, `${JSON.stringify(defaultOperatorControls(), null, 2)}\n`, "utf8");
  }
}

function loadOperatorControls(): OperatorControlState {
  ensureControlsFile();
  const parsed = JSON.parse(readFileSync(controlsFile, "utf8")) as Partial<OperatorControlState>;
  return {
    ...parsed,
    activeSessionPath: parsed.activeSessionPath ?? null,
    sessionSelectionMode: parsed.sessionSelectionMode === "manual" ? "manual" : "auto",
    heartbeat: {
      ...defaultHeartbeatControls(),
      ...(parsed.heartbeat ?? {}),
      enabled: parsed.heartbeat?.enabled ?? true,
      continuousMode: parsed.heartbeat?.continuousMode ?? false,
      intervalMs: normalizeIntervalMs(parsed.heartbeat?.intervalMs),
      lastTriggerPrompt: parsed.heartbeat?.lastTriggerPrompt ?? null,
    },
  };
}

function saveOperatorControls(nextControls: OperatorControlState): void {
  ensureControlsFile();
  const normalized: OperatorControlState = {
    ...nextControls,
    activeSessionPath: nextControls.activeSessionPath ?? null,
    sessionSelectionMode: nextControls.sessionSelectionMode === "manual" ? "manual" : "auto",
    heartbeat: {
      ...defaultHeartbeatControls(),
      ...nextControls.heartbeat,
      intervalMs: normalizeIntervalMs(nextControls.heartbeat.intervalMs),
      enabled: Boolean(nextControls.heartbeat.enabled),
      continuousMode: Boolean(nextControls.heartbeat.continuousMode),
      lastTriggerPrompt: nextControls.heartbeat.lastTriggerPrompt ?? null,
    },
  };
  writeFileSync(controlsFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function updateHeartbeatControls(mutator: (controls: HeartbeatControlState) => HeartbeatControlState): HeartbeatControlState {
  const controls = loadOperatorControls();
  const nextHeartbeat = mutator(controls.heartbeat);
  const nextControls: OperatorControlState = {
    ...controls,
    heartbeat: {
      ...nextHeartbeat,
      intervalMs: normalizeIntervalMs(nextHeartbeat.intervalMs),
    },
  };
  saveOperatorControls(nextControls);
  return nextControls.heartbeat;
}

function formatAutomationSummary(controls: HeartbeatControlState): string {
  return [
    `enabled=${controls.enabled ? "on" : "off"}`,
    `continuous=${controls.continuousMode ? "on" : "off"}`,
    `cadence=${formatIntervalMs(controls.intervalMs)}`,
  ].join(", ");
}

function buildWidgetLines(state: HeartbeatEntry): string[] {
  if (!state.currentCycle) {
    const lastCycle = state.lastCycle;
    return [
      "Heartbeat active",
      `runtime=${getAiesPaths().runtimeRoot}`,
      "phase=idle",
      `lastCycle=${lastCycle?.cycleId ?? "none"}`,
      `lastFocus=${summarizeFocus(lastCycle?.selectedFocus ?? null)}`,
      `lastCompleted=${state.lastCompletedAt ?? "never"}`,
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
    lastCycle: null,
    completedCycles: 0,
    lastPromptText: null,
    lastAssistantText: null,
    lastCompletedAt: null,
  };

  const entries = ctx.sessionManager.getEntries();
  const heartbeatEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  const restored = heartbeatEntry?.data;
  if (!restored) {
    return fallback;
  }

  const normalizedCurrentCycle = restored.currentCycle?.currentPhase === "publish_state" ? null : restored.currentCycle ?? null;
  const normalizedLastCycle = restored.lastCycle
    ?? (restored.currentCycle?.currentPhase === "publish_state" ? restored.currentCycle : null);

  return {
    currentCycle: normalizedCurrentCycle,
    lastCycle: normalizedLastCycle,
    completedCycles: restored.completedCycles ?? 0,
    lastPromptText: restored.lastPromptText ?? null,
    lastAssistantText: restored.lastAssistantText ?? null,
    lastCompletedAt: restored.lastCompletedAt ?? normalizedLastCycle?.updatedAt ?? null,
  };
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
    lastCycle: state.lastCycle,
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
  const focusDecision = inferFocusDecision(
    state.lastPromptText ?? "",
    assistantText,
    decidedAt,
    state.currentCycle.activeChangeId ?? null,
  );

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
  const completedAt = nowIso();
  const completedCycle: CycleState = {
    ...state.currentCycle,
    currentPhase: "publish_state",
    updatedAt: completedAt,
  };

  return {
    ...state,
    currentCycle: null,
    lastCycle: completedCycle,
    completedCycles: state.completedCycles + 1,
    lastCompletedAt: completedAt,
  };
}

function formatStatusLines(state: HeartbeatEntry): string[] {
  const controls = loadOperatorControls().heartbeat;
  if (!state.currentCycle) {
    const lastCycle = state.lastCycle;
    return [
      "Heartbeat state: idle",
      `Automation: ${formatAutomationSummary(controls)}`,
      `Last cycle: ${lastCycle?.cycleId ?? "none"}`,
      `Last focus: ${summarizeFocus(lastCycle?.selectedFocus ?? null)}`,
      `Last change: ${lastCycle?.activeChangeId ?? "none"}`,
      `Last completed: ${state.lastCompletedAt ?? "never"}`,
      `Completed cycles: ${state.completedCycles}`,
      `Runtime root: ${getAiesPaths().runtimeRoot}`,
    ];
  }

  return [
    `Cycle ID: ${state.currentCycle.cycleId}`,
    `Phase: ${state.currentCycle.currentPhase}`,
    `Automation: ${formatAutomationSummary(controls)}`,
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
    lastCycle: null,
    completedCycles: 0,
    lastPromptText: null,
    lastAssistantText: null,
    lastCompletedAt: null,
  };
  let lastContext: ExtensionContext | null = null;
  let cadenceTimer: NodeJS.Timeout | null = null;
  let cadenceKey: string | null = null;
  let continuousTimer: NodeJS.Timeout | null = null;
  let lastCompletedAtSeen: string | null = null;

  function clearCadenceTimer(): void {
    if (cadenceTimer) {
      clearTimeout(cadenceTimer);
      cadenceTimer = null;
    }
    cadenceKey = null;
  }

  function clearContinuousTimer(): void {
    if (continuousTimer) {
      clearTimeout(continuousTimer);
      continuousTimer = null;
    }
  }

  function isCycleActive(ctx: ExtensionContext): boolean {
    return state.currentCycle !== null || !ctx.isIdle() || ctx.hasPendingMessages();
  }

  async function compactForContinuousCycle(ctx: ExtensionContext): Promise<void> {
    await new Promise<void>((resolvePromise) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolvePromise();
      };

      try {
        ctx.compact({
          customInstructions: CONTINUOUS_COMPACTION_INSTRUCTIONS,
          onComplete: () => {
            resolveOnce();
          },
          onError: () => {
            resolveOnce();
          },
        });
      } catch {
        resolveOnce();
      }
    });
  }

  async function triggerHeartbeatCycle(ctx: ExtensionContext, options: { compactFirst?: boolean } = {}): Promise<void> {
    if (isCycleActive(ctx)) {
      return;
    }

    if (options.compactFirst) {
      await compactForContinuousCycle(ctx);
      if (isCycleActive(ctx)) {
        return;
      }
    }

    await runCycleCommand(pi, ctx, HEARTBEAT_TRIGGER_ARGS, undefined, { quietBusy: true });
  }

  function armCadenceTimer(ctx: ExtensionContext, intervalMs: number): void {
    clearCadenceTimer();
    cadenceKey = `${getSessionId(ctx)}:${intervalMs}`;
    cadenceTimer = setTimeout(() => {
      cadenceTimer = null;
      cadenceKey = null;
      void triggerHeartbeatCycle(ctx).finally(() => {
        reconcileAutomation(ctx);
      });
    }, intervalMs);
  }

  function armContinuousTimer(ctx: ExtensionContext, delayMs: number): void {
    clearContinuousTimer();
    continuousTimer = setTimeout(() => {
      continuousTimer = null;
      void triggerHeartbeatCycle(ctx, { compactFirst: true }).finally(() => {
        reconcileAutomation(ctx);
      });
    }, delayMs);
  }

  function reconcileAutomation(ctx?: ExtensionContext): void {
    const runtimeContext = ctx ?? lastContext;
    if (!runtimeContext) {
      return;
    }

    const controls = loadOperatorControls().heartbeat;
    if (!controls.enabled) {
      clearCadenceTimer();
      clearContinuousTimer();
      lastCompletedAtSeen = state.lastCompletedAt ?? lastCompletedAtSeen;
      return;
    }

    const nextCadenceKey = `${getSessionId(runtimeContext)}:${controls.intervalMs}`;
    if (cadenceKey !== nextCadenceKey || !cadenceTimer) {
      armCadenceTimer(runtimeContext, controls.intervalMs);
    }

    const completedAt = state.lastCompletedAt;
    if (lastCompletedAtSeen === null) {
      lastCompletedAtSeen = completedAt;
    }

    if (isCycleActive(runtimeContext)) {
      clearContinuousTimer();
      return;
    }

    if (!controls.continuousMode) {
      clearContinuousTimer();
      lastCompletedAtSeen = completedAt;
      return;
    }

    if (completedAt && completedAt !== lastCompletedAtSeen) {
      lastCompletedAtSeen = completedAt;
      armContinuousTimer(runtimeContext, CONTINUOUS_RESTART_DELAY_MS);
    }
  }

  pi.registerCommand(AIES_COMMANDS.heartbeatStatus, {
    description: "Show current AIES heartbeat cycle status",
    handler: async (_args, ctx) => {
      lastContext = ctx;
      updateUi(state, ctx);
      writeLine(ctx, formatStatusLines(state).join("\n"));
    },
  });

  pi.registerCommand(AIES_COMMANDS.heartbeatStart, {
    description: "Enable the heartbeat cadence scheduler used by the operator runtime",
    handler: async (_args, ctx) => {
      lastContext = ctx;
      const controls = updateHeartbeatControls((current) => ({
        ...current,
        enabled: true,
      }));
      updateUi(state, ctx);
      reconcileAutomation(ctx);
      writeLine(ctx, `Heartbeat cadence enabled (${formatAutomationSummary(controls)}).`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.heartbeatStop, {
    description: "Disable the heartbeat cadence scheduler used by the operator runtime",
    handler: async (_args, ctx) => {
      lastContext = ctx;
      const controls = updateHeartbeatControls((current) => ({
        ...current,
        enabled: false,
      }));
      updateUi(state, ctx);
      reconcileAutomation(ctx);
      writeLine(ctx, `Heartbeat cadence disabled (${formatAutomationSummary(controls)}).`, "warning");
    },
  });

  pi.registerCommand(AIES_COMMANDS.heartbeatContinuous, {
    description: "Turn heartbeat continuous mode on or off. Usage: /heartbeat-continuous on|off",
    handler: async (args, ctx) => {
      lastContext = ctx;
      const mode = args.trim().toLowerCase();
      if (mode !== "on" && mode !== "off") {
        writeLine(ctx, "Usage: /heartbeat-continuous on|off", "warning");
        return;
      }

      const controls = updateHeartbeatControls((current) => ({
        ...current,
        continuousMode: mode === "on",
      }));
      updateUi(state, ctx);
      reconcileAutomation(ctx);
      writeLine(ctx, `Heartbeat continuous mode ${mode} (${formatAutomationSummary(controls)}).`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.heartbeatCadence, {
    description: "Set heartbeat cadence. Usage: /heartbeat-cadence 5m | 30s | 1000ms",
    handler: async (args, ctx) => {
      lastContext = ctx;
      const intervalMs = parseCadenceMs(args);
      if (!intervalMs) {
        writeLine(ctx, "Usage: /heartbeat-cadence 5m | 30s | 1000ms", "warning");
        return;
      }

      const controls = updateHeartbeatControls((current) => ({
        ...current,
        intervalMs,
      }));
      updateUi(state, ctx);
      reconcileAutomation(ctx);
      writeLine(ctx, `Heartbeat cadence set to ${formatIntervalMs(intervalMs)} (${formatAutomationSummary(controls)}).`);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    lastContext = ctx;
    state = restoreState(ctx);
    updateUi(state, ctx);
    reconcileAutomation(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    lastContext = ctx;
    state = restoreState(ctx);
    updateUi(state, ctx);
    reconcileAutomation(ctx);
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    lastContext = ctx;
    const openSpecEntry = restoreOpenSpecEntry(ctx);
    state = beginCycle(state, event.prompt ?? "", getSessionId(ctx), openSpecEntry?.context.activeChangeId ?? null);
    state = advancePhase(state, "evaluate_orient");
    persistState(pi, state);
    updateUi(state, ctx);
    reconcileAutomation(ctx);
    return undefined;
  });

  pi.on("turn_start", async (_event: TurnStartEvent, ctx) => {
    lastContext = ctx;
    state = advancePhase(state, "implement");
    persistState(pi, state);
    updateUi(state, ctx);
    reconcileAutomation(ctx);
  });

  pi.on("turn_end", async (event: TurnEndEvent, ctx) => {
    lastContext = ctx;
    if (!isAssistantMessage(event.message)) {
      state = advancePhase(state, "reflect_log");
      persistState(pi, state);
      updateUi(state, ctx);
      reconcileAutomation(ctx);
      return;
    }

    const assistantText = getAssistantText(event.message);
    state = updateFocus(state, assistantText);
    persistState(pi, state);
    updateUi(state, ctx);
    reconcileAutomation(ctx);
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    lastContext = ctx;
    const assistant = latestAssistantMessage(event.messages);
    if (assistant) {
      state = updateFocus(state, getAssistantText(assistant));
    }

    state = finalizeCycle(state);
    maybeNameSession(pi, state);
    persistState(pi, state);
    updateUi(state, ctx);
    reconcileAutomation(ctx);
  });
}
