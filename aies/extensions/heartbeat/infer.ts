import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { FocusDecision } from "../../contracts/focus-decision.ts";
import type { AiesDimension, FocusType } from "../../contracts/primitives.ts";

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function inferFocusType(text: string, activeChangeId: string | null): FocusType {
  const wantsContinuation = hasAny(text, ["continue", "resume", "pick up", "follow up", "next step", "carry on"]);
  if (wantsContinuation && activeChangeId) {
    return "active_change_continuation";
  }

  if (hasAny(text, ["fix", "repair", "broken", "error", "bug", "unblock", "issue", "failed", "failure", "stale", "mismatch", "misclassif", "contradict", "inconsisten"])) {
    return "repair_self_heal";
  }

  if (hasAny(text, ["architecture", "architect", "design", "plan", "strategy", "refactor", "simplif", "structure"])) {
    return "architecture_simplification";
  }

  if (hasAny(text, ["memory", "theory", "reflect", "reflection", "devlog", "lessons", "learned"])) {
    return "memory_theory_consolidation";
  }

  if (hasAny(text, ["dimension", "judgment", "coherence", "intent", "context", "prompt", "harness", "evaluation", "evolution", "self-maintenance", "self maintenance"])) {
    return "weak_dimension_improvement";
  }

  if (hasAny(text, ["capability", "expand", "new feature", "build", "create new", "extend", "add capability", "integrate"])) {
    return "capability_expansion";
  }

  if (hasAny(text, ["explore", "research", "investigate", "discover", "survey", "prototype", "experiment with"])) {
    return "proactive_exploration";
  }

  if (hasAny(text, ["tool", "script", "skill", "helper", "utility", "automation", "scaffold"])) {
    return "tool_creation";
  }

  if (hasAny(text, ["theory experiment", "hypothesis", "test whether", "validate theory", "empirical"])) {
    return "theory_experiment";
  }

  return "other";
}

function inferLinkedDimensions(focusType: FocusType, text: string): AiesDimension[] {
  const linked = new Set<AiesDimension>();

  if (focusType === "active_change_continuation") {
    linked.add("context");
  }

  if (focusType === "repair_self_heal") {
    linked.add("harness");
    linked.add("judgment");
  }

  if (focusType === "architecture_simplification") {
    linked.add("coherence");
    linked.add("harness");
  }

  if (focusType === "memory_theory_consolidation") {
    linked.add("context");
    linked.add("evaluation");
  }

  if (focusType === "weak_dimension_improvement") {
    if (text.includes("prompt")) linked.add("prompt");
    if (text.includes("context")) linked.add("context");
    if (text.includes("intent")) linked.add("intent");
    if (text.includes("judgment")) linked.add("judgment");
    if (text.includes("coherence")) linked.add("coherence");
    if (text.includes("evaluation")) linked.add("evaluation");
    if (text.includes("harness")) linked.add("harness");
  }

  if (focusType === "capability_expansion") {
    linked.add("harness");
    linked.add("intent");
  }

  if (focusType === "proactive_exploration") {
    linked.add("context");
    linked.add("judgment");
  }

  if (focusType === "tool_creation") {
    linked.add("harness");
    linked.add("prompt");
  }

  if (focusType === "theory_experiment") {
    linked.add("coherence");
    linked.add("evaluation");
  }

  return [...linked];
}

function shorten(text: string, maxLength = 120): string {
  const compact = normalize(text);
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

export function getAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function inferFocusDecision(promptText: string, assistantText: string, decidedAt: string, activeChangeId: string | null): FocusDecision {
  const combined = `${promptText}\n${assistantText}`.toLowerCase();
  const focusType = inferFocusType(combined, activeChangeId);
  const basis = assistantText.trim() || promptText.trim() || "No explicit rationale captured.";

  return {
    focusType,
    justification: shorten(basis),
    linkedDimensions: inferLinkedDimensions(focusType, combined),
    linkedChangeId: focusType === "active_change_continuation" ? activeChangeId : null,
    alternativesConsidered: [],
    decidedAt,
  };
}

