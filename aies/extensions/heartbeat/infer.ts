import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { FocusDecision } from "../../contracts/focus-decision.ts";
import type { FocusType } from "../../contracts/primitives.ts";

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function inferFocusType(text: string): FocusType {
  if (hasAny(text, ["continue", "resume", "pick up", "follow up", "next step", "carry on"])) {
    return "active_change_continuation";
  }

  if (hasAny(text, ["fix", "repair", "broken", "error", "bug", "unblock", "issue", "failed", "failure"])) {
    return "repair_self_heal";
  }

  if (hasAny(text, ["architecture", "architect", "design", "plan", "strategy", "refactor", "simplif", "structure"])) {
    return "architecture_simplification";
  }

  if (hasAny(text, ["memory", "theory", "reflect", "reflection", "devlog", "lessons", "learned"])) {
    return "memory_theory_consolidation";
  }

  if (hasAny(text, ["dimension", "judgment", "coherence", "intent", "context", "prompt", "harness", "evaluation"])) {
    return "weak_dimension_improvement";
  }

  return "other";
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

export function inferFocusDecision(promptText: string, assistantText: string, decidedAt: string): FocusDecision {
  const combined = `${promptText}\n${assistantText}`.toLowerCase();
  const focusType = inferFocusType(combined);
  const basis = assistantText.trim() || promptText.trim() || "No explicit rationale captured.";

  return {
    focusType,
    justification: shorten(basis),
    linkedDimensions: [],
    linkedChangeId: null,
    alternativesConsidered: [],
    decidedAt,
  };
}

