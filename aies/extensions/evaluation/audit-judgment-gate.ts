import type { AuditEvidenceItem } from "../../contracts/layer-audit-snapshot.ts";
import type { AiesDimension } from "../../contracts/primitives.ts";

export interface AuditJudgmentGateReport {
  dimension: AiesDimension;
  canRateStrong: boolean;
  summary: string;
  reasons: string[];
  evidenceCount: number;
  uniqueSourceCount: number;
  hasProactiveEvidence: boolean;
  hasRuntimeBridgeEvidence: boolean;
  docOnlyEvidence: boolean;
  ambiguousEvidence: boolean;
  thinEvidence: boolean;
  postHocOnlyEvidence: boolean;
}

export interface AuditJudgmentGateOptions {
  dimension?: AiesDimension;
  requiredEvidenceIds?: string[];
  proactiveEvidenceIds?: string[];
}

const DEFAULT_PROACTIVE_EVIDENCE_IDS = [
  "audit-judgment-pause-brief",
  "audit-judgment-pause-bridge",
];

const EXECUTION_PATH_PREFIXES = [
  "aies/extensions/",
  ".pi/skills/",
  "operator-ui/",
];

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function compact(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function sourceKey(item: AuditEvidenceItem): string {
  return item.sourcePath ?? `${item.sourceType}:${item.evidenceId}`;
}

function hasVisibleExcerpt(item: AuditEvidenceItem): boolean {
  return typeof item.excerpt === "string" && item.excerpt.trim().length > 0;
}

function isExecutionPathEvidence(item: AuditEvidenceItem): boolean {
  const path = item.sourcePath ?? "";
  if (EXECUTION_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  return item.sourceType === "session_entry"
    || item.sourceType === "operator_surface"
    || item.sourceType === "command_output";
}

function isDocOnlyEvidence(item: AuditEvidenceItem): boolean {
  const path = item.sourcePath ?? "";
  if (!path) {
    return item.sourceType === "file" || item.sourceType === "directory";
  }

  return !isExecutionPathEvidence(item);
}

export function createAuditJudgmentGateReport(
  evidence: AuditEvidenceItem[],
  options: AuditJudgmentGateOptions = {},
): AuditJudgmentGateReport {
  const dimension = options.dimension ?? "judgment";
  const requiredEvidenceIds = options.requiredEvidenceIds ?? [];
  const proactiveEvidenceIds = options.proactiveEvidenceIds ?? DEFAULT_PROACTIVE_EVIDENCE_IDS;
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const uniqueSourceCount = new Set(evidence.map(sourceKey)).size;
  const hasProactiveEvidence = proactiveEvidenceIds.some((evidenceId) => evidenceIds.has(evidenceId));
  const hasRuntimeBridgeEvidence = evidence.some(isExecutionPathEvidence);
  const docOnlyEvidence = evidence.length > 0 && evidence.every(isDocOnlyEvidence);
  const missingRequiredEvidence = requiredEvidenceIds.filter((evidenceId) => !evidenceIds.has(evidenceId));
  const thinEvidence = evidence.length < Math.max(3, requiredEvidenceIds.length) || uniqueSourceCount < 2;
  const ambiguousEvidence = evidence.some((item) => !hasVisibleExcerpt(item)) || uniqueSourceCount < 2;
  const postHocOnlyEvidence = !hasProactiveEvidence || !hasRuntimeBridgeEvidence || docOnlyEvidence;

  const reasons = uniqueStrings([
    missingRequiredEvidence.length > 0
      ? `Judgment gate refused a strong rating because required evidence is still missing: ${missingRequiredEvidence.join(", ")}.`
      : "",
    thinEvidence
      ? `Judgment gate refused a strong rating because evidence is still thin (${evidence.length} item${evidence.length === 1 ? "" : "s"} across ${uniqueSourceCount} source${uniqueSourceCount === 1 ? "" : "s"}).`
      : "",
    ambiguousEvidence
      ? "Judgment gate refused a strong rating because the cited evidence is still too ambiguous to prove a proactive pause-and-doubt mechanism survives restart."
      : "",
    postHocOnlyEvidence
      ? "Judgment gate refused a strong rating because the cited evidence is still policy-only or post-hoc; no integrated execution-path pause-and-doubt bridge is clearly evidenced."
      : "",
  ]);

  const canRateStrong = evidence.length > 0 && reasons.length === 0;
  const summary = canRateStrong
    ? compact("Judgment gate found multi-surface evidence, including an execution-path pause-and-doubt bridge, so a strong rating is not being blocked by thin or policy-only proof.")
    : compact(reasons[0] ?? "Judgment gate did not find enough evidence to allow a strong rating.");

  return {
    dimension,
    canRateStrong,
    summary,
    reasons,
    evidenceCount: evidence.length,
    uniqueSourceCount,
    hasProactiveEvidence,
    hasRuntimeBridgeEvidence,
    docOnlyEvidence,
    ambiguousEvidence,
    thinEvidence,
    postHocOnlyEvidence,
  };
}

export interface AuditJudgmentPromptOptions {
  activeChangeId: string | null;
  bindingConstraint: AiesDimension | null;
  liveStatusInterpretation: string | null;
}

export function buildAuditJudgmentPromptBlock(options: AuditJudgmentPromptOptions): string {
  const continuityLine = options.activeChangeId
    ? `Current continuity bet: continue ${options.activeChangeId} unless a stronger reason to switch is explicit.`
    : "No active change exists. If the next step feels uncertain, prefer an OpenSpec proposal over ad-hoc implementation.";
  const bindingLine = options.bindingConstraint
    ? `Current audit pressure: ${options.bindingConstraint}. Let that inform doubt, not replace judgment.`
    : null;
  const liveStatusLine = options.liveStatusInterpretation
    ? `Live-status caution: ${options.liveStatusInterpretation}`
    : null;

  return [
    "AIES JUDGMENT GATE",
    continuityLine,
    bindingLine,
    "Before implementing, pause and answer explicitly:",
    "- Why is this step the highest-leverage move now?",
    "- Which local theory, OpenSpec, or runtime files will ground the change?",
    "- What evidence or counter-signal could make this step wrong, premature, or too broad?",
    "- If evidence feels thin, ambiguous, or purely post-hoc, narrow the slice or switch to planning instead of claiming a strong conclusion.",
    "- Keep verification and recovery uncertainty visible instead of hiding it behind completion language.",
    liveStatusLine,
  ].filter((line): line is string => Boolean(line)).join("\n");
}
