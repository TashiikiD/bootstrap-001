import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { EvaluationSnapshot, DimensionObservation } from "../../contracts/evaluation-snapshot.ts";
import type { CycleState } from "../../contracts/cycle-state.ts";
import type { AiesDimension, EvaluationConfidence, FocusType } from "../../contracts/primitives.ts";
import { restoreOpenSpecEntry } from "../openspec/state.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { createLayerAuditSnapshot, formatLayerAuditSnapshot } from "./audit-radar-assessment.ts";
import { formatAuditGuidanceEffectivenessReport, createAuditGuidanceEffectivenessReport, persistAuditGuidanceEffectivenessReport } from "./audit-radar-guidance-effectiveness.ts";
import { formatAuditGuidanceOutcomeReport, latestAuditGuidanceOutcomeReport } from "./audit-radar-guidance-outcomes.ts";
import { createAuditRadarGuidance, buildAuditRadarGuidancePromptBlock, formatAuditRadarGuidance } from "./audit-radar-guidance.ts";
import { createAuditDrivenOpenSpecChange, persistAuditDrivenOpenSpecChange } from "./audit-radar-proposal.ts";
import { executeAuditRadarLoop, formatAuditLoopRun } from "./audit-radar-loop.ts";
import { createAuditOutcomeReport, formatAuditOutcomeReport, persistAuditOutcomeReport } from "./audit-radar-outcomes.ts";
import { createAuditReconciliationDraft, persistAuditReconciliationDraft } from "./audit-radar-reconciliation.ts";
import { buildAuditRadarPromptBlock, buildAuditRadarWidgetLines, formatAuditRadarStatus } from "./audit-radar-runtime.ts";
import { formatAuditEvidenceScan, scanAuditEvidence } from "./audit-radar-scanner.ts";
import { latestAuditSnapshot, loadAuditSnapshotHistory, persistAuditSnapshot } from "./audit-radar-state.ts";
import { EVALUATION_ENTRY_TYPE, restoreEvaluationEntry, restoreEvaluationHistory, type EvaluationEntry } from "./state.ts";

type AgentEndEvent = {
  messages: AgentMessage[];
};

type BeforeAgentStartEvent = {
  systemPrompt: string;
};

type HeartbeatEntry = {
  currentCycle: CycleState | null;
  completedCycles: number;
  lastPromptText: string | null;
  lastAssistantText: string | null;
  lastCompletedAt: string | null;
};

const HEARTBEAT_ENTRY_TYPE = "aies-heartbeat";
const COMMAND_PREFIX = "/";

function nowIso(): string {
  return new Date().toISOString();
}

function createSnapshotId(): string {
  return `eval-${Date.now()}`;
}

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function getMessageText(message: AgentMessage | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function getLatestUserText(messages: AgentMessage[]): string {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  return getMessageText(userMessage);
}

function getLatestAssistantText(messages: AgentMessage[]): string {
  const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  return getMessageText(assistantMessage);
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 140): string {
  const compact = normalize(text);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseAuditPlanArgs(rawArgs: string | undefined): { forceNew: boolean; dimensionArgs: string } {
  const parts = (rawArgs ?? "").split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const forceNew = parts.includes("--new");
  return {
    forceNew,
    dimensionArgs: parts.filter((part) => part !== "--new").join(" "),
  };
}

function restoreHeartbeat(ctx: ExtensionContext): HeartbeatEntry | null {
  const entries = ctx.sessionManager.getEntries();
  const heartbeatEntry = entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === HEARTBEAT_ENTRY_TYPE)
    .pop() as { data?: HeartbeatEntry } | undefined;

  return heartbeatEntry?.data ?? null;
}

function persistHeartbeat(pi: ExtensionAPI, state: HeartbeatEntry): void {
  pi.appendEntry(HEARTBEAT_ENTRY_TYPE, state);
}

function isCommandPrompt(promptText: string): boolean {
  return promptText.trim().startsWith(COMMAND_PREFIX);
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function scoreObservation(dimension: AiesDimension, promptText: string, assistantText: string, cycle: CycleState, openSpecActive: boolean): DimensionObservation {
  const prompt = promptText.toLowerCase();
  const assistant = assistantText.toLowerCase();
  const evidence: string[] = [];
  let score = 0;
  let driftNote: string | null = null;

  if (dimension === "prompt") {
    if (promptText.trim().length >= 12) {
      score += 2;
      evidence.push("Prompt is concrete enough to act on.");
    }
    if (includesAny(prompt, ["fix", "implement", "plan", "review", "wire", "add", "update"])) {
      score += 1;
      evidence.push("Prompt includes a bounded action verb.");
    }
    if (promptText.trim().length < 12) {
      driftNote = "prompt is underspecified";
    }
  }

  if (dimension === "context") {
    if (cycle.activeChangeId) {
      score += 2;
      evidence.push(`Cycle keeps active change context: ${cycle.activeChangeId}.`);
    }
    if (openSpecActive) {
      score += 1;
      evidence.push("OpenSpec continuity was available during the cycle.");
    }
    if (!cycle.activeChangeId && openSpecActive) {
      driftNote = "active-change discontinuity";
    }
  }

  if (dimension === "intent") {
    if (cycle.selectedFocus && cycle.selectedFocus.focusType !== "other") {
      score += 2;
      evidence.push(`Focus was chosen explicitly: ${cycle.selectedFocus.focusType}.`);
    }
    if (includesAny(prompt + " " + assistant, ["aies", "pi", "memory", "openspec", "evaluation", "self-evolution"])) {
      score += 1;
      evidence.push("Turn content stays inside the AIES self-evolution domain.");
    }
    if (cycle.selectedFocus && ["capability_expansion", "proactive_exploration", "tool_creation", "theory_experiment"].includes(cycle.selectedFocus.focusType)) {
      score += 1;
      evidence.push("Focus type indicates proactive evolution.");
    }
    if (!cycle.selectedFocus || cycle.selectedFocus.focusType === "other") {
      driftNote = "intent is weakly expressed";
    }
  }

  if (dimension === "judgment") {
    if (cycle.rationale && cycle.rationale.trim().length >= 8) {
      score += 2;
      evidence.push("Cycle includes an explicit rationale.");
    }
    if (includesAny(assistant, ["because", "so that", "therefore", "should"])) {
      score += 1;
      evidence.push("Assistant output contains tradeoff or justification language.");
    }
    if (!cycle.rationale) {
      driftNote = "weak rationale";
    }
  }

  if (dimension === "coherence") {
    if (cycle.selectedFocus && cycle.rationale) {
      score += 2;
      evidence.push("Focus and rationale were both present.");
    }
    if (assistantText && (cycle.rationale ? assistantText.includes(cycle.rationale) : false)) {
      score += 1;
      evidence.push("Assistant output aligns with the recorded rationale.");
    }
    if (cycle.selectedFocus?.focusType === "other" && cycle.activeChangeId) {
      driftNote = "focus is weak relative to active context";
    }
    if (!cycle.activeChangeId && cycle.selectedFocus?.focusType === "repair_self_heal") {
      driftNote = driftNote ?? "maintenance-without-ambition: no active change and focus is repair-oriented";
    }
  }

  if (dimension === "evaluation") {
    if (includesAny(assistant, ["learned", "next", "recommend", "confidence", "reflect", "evaluation"])) {
      score += 2;
      evidence.push("Assistant output contains explicit reflective or evaluative language.");
    }
    if (cycle.rationale) {
      score += 1;
      evidence.push("Cycle rationale provides a minimal self-assessment signal.");
    }
    if (!includesAny(assistant, ["learned", "next", "recommend", "confidence", "reflect", "evaluation"])) {
      driftNote = "verification or self-assessment absent";
    }
  }

  if (dimension === "harness") {
    if (!includesAny(prompt + " " + assistant, ["benchmark", "unlock", "metric farm", "ritual", "ceremony", "gating"])) {
      score += 2;
      evidence.push("Turn avoids obvious harness ritual language.");
    }
    if (includesAny(assistant, ["visible", "status", "command", "extension", "session"])) {
      score += 1;
      evidence.push("Output interacts with the Pi/AIES substrate directly.");
    }
    if (includesAny(prompt + " " + assistant, ["ritual", "ceremony", "benchmark", "unlock"])) {
      driftNote = "harness ritual risk";
    }
  }

  const boundedScore = evidence.length === 0 ? null : Math.max(0, Math.min(3, score));
  return { dimension, score: boundedScore, evidence, driftNote };
}

function deriveNeglectedDimensions(dimensions: DimensionObservation[]): AiesDimension[] {
  return dimensions.filter((item) => item.score === null || item.score <= 1).map((item) => item.dimension);
}

function deriveDriftMarkers(dimensions: DimensionObservation[]): string[] {
  const markers = dimensions.map((item) => item.driftNote).filter((item): item is string => Boolean(item));
  return [...new Set(markers)].slice(0, 3);
}

function summarizeBalance(neglected: AiesDimension[], driftMarkers: string[]): string {
  if (neglected.length <= 1 && driftMarkers.length === 0) {
    return "The cycle looks balanced with only minor neglected areas.";
  }
  if (neglected.length <= 3) {
    return "The cycle is usable but shows a few neglected dimensions that should stay visible.";
  }
  return "The cycle is uneven and would benefit from explicit rebalancing next turn.";
}

function suggestFocus(neglected: AiesDimension[], cycle: CycleState): FocusType | null {
  if (neglected.includes("context") && cycle.activeChangeId) return "active_change_continuation";
  if (neglected.includes("harness")) return "capability_expansion";
  if (neglected.includes("evaluation")) return "theory_experiment";
  if (neglected.some((item) => item === "prompt" || item === "judgment" || item === "coherence")) return "capability_expansion";
  if (neglected.includes("intent")) return "proactive_exploration";
  return null;
}

function recommendationForFocus(suggestedFocus: FocusType | null): string {
  switch (suggestedFocus) {
    case "active_change_continuation":
      return "Continue the active change and keep the continuity rationale explicit.";
    case "repair_self_heal":
      return "Reduce harness friction or process thrash before broadening scope.";
    case "memory_theory_consolidation":
      return "Capture what was learned and make the next-step judgment more explicit.";
    case "architecture_simplification":
      return "Tighten focus and rationale so the next turn is more coherent and bounded.";
    case "weak_dimension_improvement":
      return "Address the neglected dimensions directly, but do not force the lowest one if a better move is justified.";
    case "capability_expansion":
      return "Build or extend a capability. Create a new tool, integrate a new pattern, or expand what you can do in future cycles.";
    case "proactive_exploration":
      return "Investigate something new. Research external tools, explore unfamiliar patterns, or prototype an approach you haven't tried.";
    case "tool_creation":
      return "Create a concrete new tool, script, or skill that makes future evolution cycles more productive.";
    case "theory_experiment":
      return "Test an AIES theory hypothesis by building something and observing the result. Record the insight in theory-fork.";
    default:
      return "Keep continuity explicit and improve the weakest visible areas without over-constraining the next turn.";
  }
}

function deriveConfidence(dimensions: DimensionObservation[]): EvaluationConfidence {
  const scored = dimensions.filter((item) => item.score !== null);
  const strong = dimensions.filter((item) => (item.score ?? 0) >= 2).length;
  if (scored.length >= 5 && strong >= 4) return "high";
  if (scored.length >= 3) return "medium";
  return "low";
}

function createSnapshot(promptText: string, assistantText: string, cycle: CycleState, openSpecActive: boolean): EvaluationSnapshot {
  const observedAt = nowIso();
  const dimensions: DimensionObservation[] = ["prompt", "context", "intent", "judgment", "coherence", "evaluation", "harness"]
    .map((dimension) => scoreObservation(dimension, promptText, assistantText, cycle, openSpecActive));
  const neglectedDimensions = deriveNeglectedDimensions(dimensions);
  const driftMarkers = deriveDriftMarkers(dimensions);
  const suggestedFocus = suggestFocus(neglectedDimensions, cycle);

  return {
    snapshotId: createSnapshotId(),
    observedAt,
    dimensions,
    neglectedDimensions,
    driftMarkers,
    balanceSummary: summarizeBalance(neglectedDimensions, driftMarkers),
    suggestedFocus,
    recommendation: recommendationForFocus(suggestedFocus),
    confidence: deriveConfidence(dimensions),
  };
}

function persistEntry(pi: ExtensionAPI, entry: EvaluationEntry): void {
  pi.appendEntry(EVALUATION_ENTRY_TYPE, entry);
}

function updateHeartbeatWithSnapshot(pi: ExtensionAPI, heartbeat: HeartbeatEntry, snapshotId: string): HeartbeatEntry {
  if (!heartbeat.currentCycle) {
    return heartbeat;
  }

  const nextHeartbeat: HeartbeatEntry = {
    ...heartbeat,
    currentCycle: {
      ...heartbeat.currentCycle,
      evaluationSnapshotId: snapshotId,
      updatedAt: nowIso(),
    },
  };
  persistHeartbeat(pi, nextHeartbeat);
  return nextHeartbeat;
}

function formatDimension(item: DimensionObservation): string {
  return `${item.dimension}: score=${item.score ?? "null"} evidence=${item.evidence.length} drift=${item.driftNote ?? "none"}`;
}

function formatDetailed(entry: EvaluationEntry): string {
  const snapshot = entry.snapshot;
  return [
    `Snapshot: ${snapshot.snapshotId}`,
    `Cycle: ${entry.cycleId ?? "none"}`,
    `Change: ${entry.relatedChangeId ?? "none"}`,
    `Confidence: ${snapshot.confidence}`,
    `Neglected: ${snapshot.neglectedDimensions.length > 0 ? snapshot.neglectedDimensions.join(", ") : "none"}`,
    `Drift: ${snapshot.driftMarkers.length > 0 ? snapshot.driftMarkers.join(", ") : "none"}`,
    `Suggested focus: ${snapshot.suggestedFocus ?? "none"}`,
    `Recommendation: ${snapshot.recommendation}`,
    `Balance: ${snapshot.balanceSummary}`,
    ...snapshot.dimensions.map(formatDimension),
  ].join("\n");
}

function formatCompact(entry: EvaluationEntry): string {
  const snapshot = entry.snapshot;
  return [
    `Snapshot: ${snapshot.snapshotId}`,
    `Confidence: ${snapshot.confidence}`,
    `Neglected: ${snapshot.neglectedDimensions.length > 0 ? snapshot.neglectedDimensions.join(", ") : "none"}`,
    `Drift: ${snapshot.driftMarkers[0] ?? "none"}`,
    `Recommendation: ${snapshot.recommendation}`,
  ].join("\n");
}

function formatReviewLine(entry: EvaluationEntry): string {
  const snapshot = entry.snapshot;
  const neglected = snapshot.neglectedDimensions.slice(0, 2).join(",") || "none";
  const drift = snapshot.driftMarkers[0] ?? "none";
  const focus = snapshot.suggestedFocus ?? "none";
  return `Eval: ${snapshot.confidence} | neglected=${neglected} | drift=${drift} | focus=${focus}`;
}

function shouldEmitReview(snapshot: EvaluationSnapshot): boolean {
  if (snapshot.confidence !== "high") return true;
  if (snapshot.neglectedDimensions.length > 0) return true;
  if (snapshot.driftMarkers.length > 0) return true;
  return false;
}

function formatHistory(entries: EvaluationEntry[], count: number): string {
  const items = entries.slice(-count).reverse();
  if (items.length === 0) {
    return "Evaluation history: none";
  }
  return items
    .map((entry) => `${entry.snapshot.snapshotId} | ${entry.snapshot.confidence} | ${entry.snapshot.recommendation}`)
    .join("\n");
}

function updateUi(entry: EvaluationEntry | null, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const auditWidget = buildAuditRadarWidgetLines(latestAuditSnapshot());

  if (!entry) {
    ctx.ui.setStatus(AIES_STATUS_KEYS.evaluation, ctx.ui.theme.fg("accent", "eval:none"));
    ctx.ui.setWidget(AIES_WIDGET_KEYS.evaluation, ["Evaluation active", "snapshot=none", "recommendation=none", ...auditWidget]);
    return;
  }

  ctx.ui.setStatus(AIES_STATUS_KEYS.evaluation, ctx.ui.theme.fg("accent", `eval:${entry.snapshot.confidence}`));
  ctx.ui.setWidget(AIES_WIDGET_KEYS.evaluation, [
    `snapshot=${entry.snapshot.snapshotId}`,
    `neglected=${entry.snapshot.neglectedDimensions.slice(0, 2).join(",") || "none"}`,
    `drift=${entry.snapshot.driftMarkers[0] ?? "none"}`,
    `recommend=${entry.snapshot.recommendation}`,
    ...auditWidget,
  ]);
}

function buildPromptBlock(entry: EvaluationEntry | null): string | null {
  if (!entry) return null;

  const snapshot = entry.snapshot;
  if (snapshot.neglectedDimensions.length === 0 && snapshot.driftMarkers.length === 0) {
    return null;
  }

  return [
    "AIES EVALUATION CONTEXT",
    `Neglected dimensions: ${snapshot.neglectedDimensions.slice(0, 2).join(", ") || "none"}`,
    `Top drift: ${snapshot.driftMarkers[0] ?? "none"}`,
    `Recommendation: ${snapshot.recommendation}`,
    "This is advisory only. Continue active work when it is better justified, and do not force lowest-dimension targeting.",
  ].join("\n");
}

export default function aiesEvaluationExtension(pi: ExtensionAPI): void {
  let latestEntry: EvaluationEntry | null = null;

  pi.registerCommand(AIES_COMMANDS.evaluationStatus, {
    description: "Show the latest AIES evaluation snapshot",
    handler: async (_args, ctx) => {
      latestEntry = restoreEvaluationEntry(ctx);
      updateUi(latestEntry, ctx);
      writeLine(ctx, latestEntry ? formatDetailed(latestEntry) : "Evaluation: none");
    },
  });

  pi.registerCommand(AIES_COMMANDS.evaluationLast, {
    description: "Show the latest AIES evaluation summary",
    handler: async (_args, ctx) => {
      latestEntry = restoreEvaluationEntry(ctx);
      updateUi(latestEntry, ctx);
      writeLine(ctx, latestEntry ? formatCompact(latestEntry) : "Evaluation: none");
    },
  });

  pi.registerCommand(AIES_COMMANDS.evaluationReview, {
    description: "Show the latest AIES evaluation one-line review",
    handler: async (_args, ctx) => {
      latestEntry = restoreEvaluationEntry(ctx);
      updateUi(latestEntry, ctx);
      writeLine(ctx, latestEntry ? formatReviewLine(latestEntry) : "Evaluation: none");
    },
  });

  pi.registerCommand(AIES_COMMANDS.evaluationHistory, {
    description: "Show recent AIES evaluation snapshot history",
    handler: async (args, ctx) => {
      const count = Number.parseInt((args ?? "").trim(), 10);
      const history = restoreEvaluationHistory(ctx);
      updateUi(restoreEvaluationEntry(ctx), ctx);
      writeLine(ctx, formatHistory(history, Number.isFinite(count) && count > 0 ? count : 5));
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarScan, {
    description: "Scan curated repo surfaces and cite audit evidence across the 5+2 AIES stack",
    handler: async (args, ctx) => {
      writeLine(ctx, formatAuditEvidenceScan(scanAuditEvidence(), args ?? ""));
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarAssess, {
    description: "Assess the 5+2 AIES stack with theory-grounded strong/partial/missing layer ratings",
    handler: async (_args, ctx) => {
      const history = loadAuditSnapshotHistory();
      const snapshot = createLayerAuditSnapshot(scanAuditEvidence(), history);
      const persistedPath = persistAuditSnapshot(snapshot);
      updateUi(restoreEvaluationEntry(ctx), ctx);
      writeLine(ctx, `${formatLayerAuditSnapshot(snapshot)}\nPersisted: ${persistedPath}`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarStatus, {
    description: "Show the latest durable audit-radar summary, binding constraint, and recommended change direction",
    handler: async (_args, ctx) => {
      const snapshot = latestAuditSnapshot();
      updateUi(restoreEvaluationEntry(ctx), ctx);
      if (!snapshot) {
        writeLine(ctx, "Audit radar: no durable snapshot yet. Run /audit-radar-assess first.", "warning");
        return;
      }

      const openSpecEntry = restoreOpenSpecEntry(ctx);
      writeLine(ctx, formatAuditRadarStatus(snapshot, openSpecEntry?.context.activeChangeId ?? null));
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarNext, {
    description: "Synthesize the latest durable audit into a next-cycle guidance brief with focus, targets, and continuity advice",
    handler: async (_args, ctx) => {
      const snapshot = latestAuditSnapshot();
      updateUi(restoreEvaluationEntry(ctx), ctx);
      if (!snapshot) {
        writeLine(ctx, "Audit radar guidance needs a durable snapshot. Run /audit-radar-assess first.", "warning");
        return;
      }

      const openSpecEntry = restoreOpenSpecEntry(ctx);
      const guidance = createAuditRadarGuidance(snapshot, openSpecEntry?.context.activeChangeId ?? null);
      writeLine(ctx, formatAuditRadarGuidance(guidance));
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarGuidanceReview, {
    description: "Review the latest durable audit-guidance outcome report to see whether guidance aligned with recorded cycle focus",
    handler: async (_args, ctx) => {
      updateUi(restoreEvaluationEntry(ctx), ctx);
      const report = latestAuditGuidanceOutcomeReport();
      if (!report) {
        writeLine(ctx, "No audit-guidance outcome report exists yet. Run a guided /cycle-run first.", "warning");
        return;
      }

      writeLine(ctx, formatAuditGuidanceOutcomeReport(report));
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarGuidanceEffectiveness, {
    description: "Compare guidance-alignment reports against linked post-run audit drift, correction paths, and scope-aware verification floors",
    handler: async (_args, ctx) => {
      updateUi(restoreEvaluationEntry(ctx), ctx);
      const report = createAuditGuidanceEffectivenessReport();
      if (!report) {
        writeLine(ctx, "Audit guidance effectiveness needs at least one durable guidance-outcome report. Run a guided /cycle-run first.", "warning");
        return;
      }

      const persistedPath = persistAuditGuidanceEffectivenessReport(report);
      writeLine(ctx, `${formatAuditGuidanceEffectivenessReport(report)}\nPersisted: ${persistedPath}`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarOutcomes, {
    description: "Compare consecutive audit snapshots against observed correction paths and persist a durable outcome report",
    handler: async (_args, ctx) => {
      const report = createAuditOutcomeReport();
      if (!report) {
        writeLine(ctx, "Audit outcomes need at least two durable snapshots. Run /audit-radar-assess across multiple cycles first.", "warning");
        return;
      }

      const persistedPath = persistAuditOutcomeReport(report);
      writeLine(ctx, `${formatAuditOutcomeReport(report)}\nPersisted: ${persistedPath}`);
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarLoop, {
    description: "Run audit assessment, outcome comparison, and quick verification as one reproducible audit-radar loop",
    handler: async (_args, ctx) => {
      const result = executeAuditRadarLoop(pi, ctx);
      updateUi(restoreEvaluationEntry(ctx), ctx);
      writeLine(ctx, formatAuditLoopRun(result));
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarPropose, {
    description: "Draft a follow-on OpenSpec change from the latest durable audit snapshot, or reconcile an aligned active change; optional args: target dimension, --new",
    handler: async (args, ctx) => {
      const snapshot = latestAuditSnapshot();
      if (!snapshot) {
        writeLine(ctx, "No durable audit snapshot exists yet. Run /audit-radar-assess first.", "warning");
        return;
      }

      const parsedArgs = parseAuditPlanArgs(args);
      const openSpecEntry = restoreOpenSpecEntry(ctx);
      if (!parsedArgs.forceNew) {
        const reconciliation = createAuditReconciliationDraft(snapshot, openSpecEntry, parsedArgs.dimensionArgs);
        if (reconciliation) {
          const persistedPath = persistAuditReconciliationDraft(reconciliation);
          writeLine(
            ctx,
            [
              `Reconciled active OpenSpec change: ${reconciliation.changeId}`,
              `Title: ${reconciliation.title ?? "unknown"}`,
              `Dimension: ${reconciliation.selectedDimension}`,
              `Source snapshot: ${reconciliation.sourceSnapshotPath}`,
              `Added task: ${reconciliation.addedTask}`,
              `Reason: ${reconciliation.reason}`,
              `Persisted: ${persistedPath}`,
              "Tip: pass --new to force a separate follow-on proposal file.",
            ].join("\n"),
          );
          return;
        }
      }

      const draft = createAuditDrivenOpenSpecChange(snapshot, parsedArgs.dimensionArgs);
      const persistedPath = persistAuditDrivenOpenSpecChange(draft);
      writeLine(
        ctx,
        [
          `Created OpenSpec draft: ${draft.changeId}`,
          `Title: ${draft.title}`,
          `Dimension: ${draft.selectedDimension}`,
          `Source snapshot: ${draft.sourceSnapshotPath}`,
          `Persisted: ${persistedPath}`,
        ].join("\n"),
      );
    },
  });

  pi.registerCommand(AIES_COMMANDS.auditRadarReconcile, {
    description: "Merge the latest durable audit findings into an aligned active OpenSpec change instead of creating a new proposal",
    handler: async (args, ctx) => {
      const snapshot = latestAuditSnapshot();
      if (!snapshot) {
        writeLine(ctx, "No durable audit snapshot exists yet. Run /audit-radar-assess first.", "warning");
        return;
      }

      const parsedArgs = parseAuditPlanArgs(args);
      const reconciliation = createAuditReconciliationDraft(snapshot, restoreOpenSpecEntry(ctx), parsedArgs.dimensionArgs);
      if (!reconciliation) {
        writeLine(ctx, "No aligned active OpenSpec change could be reconciled. Use /audit-radar-propose --new to draft a separate follow-on change.", "warning");
        return;
      }

      const persistedPath = persistAuditReconciliationDraft(reconciliation);
      writeLine(
        ctx,
        [
          `Reconciled active OpenSpec change: ${reconciliation.changeId}`,
          `Title: ${reconciliation.title ?? "unknown"}`,
          `Dimension: ${reconciliation.selectedDimension}`,
          `Source snapshot: ${reconciliation.sourceSnapshotPath}`,
          `Added task: ${reconciliation.addedTask}`,
          `Reason: ${reconciliation.reason}`,
          `Persisted: ${persistedPath}`,
        ].join("\n"),
      );
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    latestEntry = restoreEvaluationEntry(ctx);
    updateUi(latestEntry, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    latestEntry = restoreEvaluationEntry(ctx);
    updateUi(latestEntry, ctx);
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    latestEntry = restoreEvaluationEntry(ctx);
    updateUi(latestEntry, ctx);

    const openSpecEntry = restoreOpenSpecEntry(ctx);
    const promptBlocks = [
      buildPromptBlock(latestEntry),
      (() => {
        const auditSnapshot = latestAuditSnapshot();
        return auditSnapshot ? buildAuditRadarPromptBlock(auditSnapshot, openSpecEntry?.context.activeChangeId ?? null) : null;
      })(),
      (() => {
        const auditSnapshot = latestAuditSnapshot();
        if (!auditSnapshot) {
          return null;
        }
        return buildAuditRadarGuidancePromptBlock(createAuditRadarGuidance(auditSnapshot, openSpecEntry?.context.activeChangeId ?? null));
      })(),
    ].filter((block): block is string => Boolean(block));

    if (promptBlocks.length === 0) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${promptBlocks.join("\n\n")}`,
    };
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    const heartbeat = restoreHeartbeat(ctx);
    const cycle = heartbeat?.currentCycle;
    if (!cycle) return;

    const promptText = getLatestUserText(event.messages) || heartbeat?.lastPromptText || "";
    if (isCommandPrompt(promptText)) {
      latestEntry = restoreEvaluationEntry(ctx);
      updateUi(latestEntry, ctx);
      return;
    }

    const assistantText = getLatestAssistantText(event.messages) || heartbeat?.lastAssistantText || "";
    const openSpecEntry = restoreOpenSpecEntry(ctx);
    const snapshot = createSnapshot(promptText, assistantText, cycle, Boolean(openSpecEntry?.context.activeChangeId));
    const entry: EvaluationEntry = {
      snapshot,
      cycleId: cycle.cycleId,
      relatedChangeId: cycle.activeChangeId,
      createdAt: snapshot.observedAt,
    };

    persistEntry(pi, entry);
    updateHeartbeatWithSnapshot(pi, heartbeat, snapshot.snapshotId);
    latestEntry = entry;
    updateUi(latestEntry, ctx);

    if (shouldEmitReview(snapshot)) {
      writeLine(ctx, formatReviewLine(entry), snapshot.confidence === "low" ? "warning" : "info");
    }
  });
}
