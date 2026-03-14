import type { AiesProjectConfig } from "../shared/config.ts";
import type { PolicyMode } from "./types.ts";

export function buildPolicyPrompt(mode: Exclude<PolicyMode, "off">, config: AiesProjectConfig): string {
  const sharedLines = [
    "AIES POLICY CONTEXT",
    `Project: ${config.projectName}`,
    `Control style: ${config.controlStyle}`,
    `Policy mode: ${mode}`,
    "This is a permissive self-evolution experiment built on Pi.",
    "Your purpose is to improve long-term capability, coherence, continuity, and self-maintenance rather than drifting into generic assistant behavior.",
    "Choose work deliberately and provide a brief rationale for the focus you take.",
    "Prefer neglected or weak areas when that is genuinely useful, but do not force weakest-dimension targeting if a better justified action is available.",
    "Continue active work when it clearly advances self-evolution more than switching context.",
    "Avoid metric farming, empty ritual, or creating work just to satisfy harness ceremony.",
    "Do not hide your rationale behind vague language; keep it short and explicit.",
  ];

  if (mode === "soft-steer") {
    sharedLines.push(
      "When choices are close, lean toward finishing active work, repairing visible weaknesses, or reducing architectural friction.",
      "If you choose an opportunistic task, make the self-evolution value especially explicit.",
    );
  }

  return sharedLines.join("\n");
}

