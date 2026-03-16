import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import type {
  AuditGuidanceEffectivenessReport,
  AuditGuidanceEffectivenessVerdict,
} from "./audit-radar-guidance-effectiveness.ts";
import {
  createAuditGuidanceEffectivenessReport,
  loadAuditGuidanceEffectivenessHistory,
} from "./audit-radar-guidance-effectiveness.ts";
import { loadAuditGuidanceOutcomeHistory } from "./audit-radar-guidance-outcomes.ts";
import { latestAuditSnapshot, loadAuditSnapshotHistory } from "./audit-radar-state.ts";

export type AuditGuidanceAdaptationStatus =
  | "insufficient_history"
  | "counter_signaled"
  | "mixed_signals"
  | "provisionally_supportive"
  | "divergence_watch";

export interface AuditGuidanceAdaptationThresholds {
  minimumPersistedEffectivenessReports: number;
  minimumGuidanceOutcomes: number;
  minimumComparableItems: number;
  minimumLinkedPostRunAudits: number;
}

export interface AuditGuidanceAdaptationCorpusSummary {
  persistedEffectivenessReports: number;
  guidanceOutcomes: number;
  comparableItems: number;
  linkedPostRunAudits: number;
  alignedOutcomes: number;
  partiallyAlignedOutcomes: number;
  divergedOutcomes: number;
  floorEscalations: number;
  recentSnapshotCount: number;
}

export interface AuditGuidanceAdaptationSignalSummary {
  dominantVerdict: AuditGuidanceEffectivenessVerdict | "none";
  supportiveSignals: number;
  counterSignals: number;
  alternativeSignals: number;
  mixedSignals: number;
  insufficientEvidence: number;
  alignedCounterSignals: number;
  divergedAlternativeSignals: number;
}

export interface AuditGuidanceAdaptationReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  status: AuditGuidanceAdaptationStatus;
  advisoryOnly: true;
  autoOverrideProhibited: true;
  thresholds: AuditGuidanceAdaptationThresholds;
  corpus: AuditGuidanceAdaptationCorpusSummary;
  signals: AuditGuidanceAdaptationSignalSummary;
  latestContext: {
    snapshotId: string | null;
    bindingConstraint: AiesDimension | null;
    effectivenessReportId: string | null;
  };
  summary: string;
  note: string;
  recommendedAdjustment: string;
  missingThresholds: string[];
  limitations: string[];
}

const DEFAULT_THRESHOLDS: AuditGuidanceAdaptationThresholds = {
  minimumPersistedEffectivenessReports: 2,
  minimumGuidanceOutcomes: 2,
  minimumComparableItems: 2,
  minimumLinkedPostRunAudits: 2,
};

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function createReportId(generatedAt: IsoTimestamp): string {
  return `audit-guidance-adaptation-${generatedAt.replace(/[:.]/g, "-")}`;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function compact(text: string | null | undefined, maxLength = 220): string {
  const normalized = normalize(String(text ?? ""));
  if (!normalized) {
    return "none";
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeReportFileName(report: AuditGuidanceAdaptationReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

export function ensureAuditGuidanceAdaptationDirectory(): string {
  const directory = getAiesPaths().auditRadarGuidanceAdaptationRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

function isAuditGuidanceAdaptationStatus(value: unknown): value is AuditGuidanceAdaptationStatus {
  return value === "insufficient_history"
    || value === "counter_signaled"
    || value === "mixed_signals"
    || value === "provisionally_supportive"
    || value === "divergence_watch";
}

function isVerdict(value: unknown): value is AuditGuidanceEffectivenessVerdict | "none" {
  return value === "supportive_signal"
    || value === "counter_signal"
    || value === "alternative_signal"
    || value === "mixed_signal"
    || value === "insufficient_evidence"
    || value === "none";
}

function isAuditGuidanceAdaptationReport(value: unknown): value is AuditGuidanceAdaptationReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditGuidanceAdaptationReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && isAuditGuidanceAdaptationStatus(candidate.status)
    && candidate.advisoryOnly === true
    && candidate.autoOverrideProhibited === true
    && typeof candidate.summary === "string"
    && typeof candidate.note === "string"
    && typeof candidate.recommendedAdjustment === "string"
    && Array.isArray(candidate.missingThresholds)
    && Array.isArray(candidate.limitations)
    && Boolean(candidate.thresholds)
    && Boolean(candidate.corpus)
    && Boolean(candidate.signals)
    && isVerdict(candidate.signals?.dominantVerdict);
}

function verdictCounts(report: AuditGuidanceEffectivenessReport | null): AuditGuidanceAdaptationSignalSummary {
  const zero = {
    dominantVerdict: "none" as const,
    supportiveSignals: 0,
    counterSignals: 0,
    alternativeSignals: 0,
    mixedSignals: 0,
    insufficientEvidence: 0,
    alignedCounterSignals: 0,
    divergedAlternativeSignals: 0,
  };

  if (!report) {
    return zero;
  }

  const counts = {
    supportive_signal: report.verdictCounts.supportive_signal ?? 0,
    counter_signal: report.verdictCounts.counter_signal ?? 0,
    alternative_signal: report.verdictCounts.alternative_signal ?? 0,
    mixed_signal: report.verdictCounts.mixed_signal ?? 0,
    insufficient_evidence: report.verdictCounts.insufficient_evidence ?? 0,
  };

  const ordered = Object.entries(counts)
    .sort((left, right) => right[1] - left[1]);
  const dominantVerdict = ordered[0]?.[1] && ordered[0][1] > 0
    ? ordered[0][0] as AuditGuidanceEffectivenessVerdict
    : "none";

  return {
    dominantVerdict,
    supportiveSignals: counts.supportive_signal,
    counterSignals: counts.counter_signal,
    alternativeSignals: counts.alternative_signal,
    mixedSignals: counts.mixed_signal,
    insufficientEvidence: counts.insufficient_evidence,
    alignedCounterSignals: report.items.filter((item) => item.alignmentStatus === "aligned" && item.verdict === "counter_signal").length,
    divergedAlternativeSignals: report.items.filter((item) => item.alignmentStatus === "diverged" && item.verdict === "alternative_signal").length,
  };
}

function listMissingThresholds(
  thresholds: AuditGuidanceAdaptationThresholds,
  corpus: AuditGuidanceAdaptationCorpusSummary,
): string[] {
  const missing: string[] = [];

  if (corpus.persistedEffectivenessReports < thresholds.minimumPersistedEffectivenessReports) {
    missing.push(`persisted effectiveness reports ${corpus.persistedEffectivenessReports}/${thresholds.minimumPersistedEffectivenessReports}`);
  }
  if (corpus.guidanceOutcomes < thresholds.minimumGuidanceOutcomes) {
    missing.push(`guidance outcomes ${corpus.guidanceOutcomes}/${thresholds.minimumGuidanceOutcomes}`);
  }
  if (corpus.comparableItems < thresholds.minimumComparableItems) {
    missing.push(`comparable items ${corpus.comparableItems}/${thresholds.minimumComparableItems}`);
  }
  if (corpus.linkedPostRunAudits < thresholds.minimumLinkedPostRunAudits) {
    missing.push(`linked post-run audits ${corpus.linkedPostRunAudits}/${thresholds.minimumLinkedPostRunAudits}`);
  }

  return missing;
}

function summarizeInsufficientHistory(
  corpus: AuditGuidanceAdaptationCorpusSummary,
  thresholds: AuditGuidanceAdaptationThresholds,
  signals: AuditGuidanceAdaptationSignalSummary,
): { summary: string; note: string; recommendedAdjustment: string; limitations: string[] } {
  const currentSignal = signals.dominantVerdict !== "none"
    ? ` Current dominant signal: ${signals.dominantVerdict}.`
    : "";

  return {
    summary: compact(
      `Guidance adaptation remains insufficient_history because the durable corpus is still too small to treat effectiveness patterns as more than anecdotal (${corpus.persistedEffectivenessReports}/${thresholds.minimumPersistedEffectivenessReports} reports, ${corpus.guidanceOutcomes}/${thresholds.minimumGuidanceOutcomes} outcomes, ${corpus.linkedPostRunAudits}/${thresholds.minimumLinkedPostRunAudits} linked audits).${currentSignal}`,
      260,
    ),
    note: compact(
      `insufficient_history: keep current audit guidance advisory and unchanged except for a low-confidence trust note. The corpus has ${corpus.persistedEffectivenessReports}/${thresholds.minimumPersistedEffectivenessReports} persisted effectiveness reports, ${corpus.guidanceOutcomes}/${thresholds.minimumGuidanceOutcomes} guidance outcomes, ${corpus.comparableItems}/${thresholds.minimumComparableItems} comparable items, and ${corpus.linkedPostRunAudits}/${thresholds.minimumLinkedPostRunAudits} linked post-run audits.${currentSignal}`,
      260,
    ),
    recommendedAdjustment: "Do not tune guidance synthesis yet; keep collecting guided-cycle history and surface the thin-history warning explicitly.",
    limitations: [
      "History is below the minimum threshold for repeated-pattern claims.",
      "Any current supportive or counter signal is still correlational and anecdotal.",
    ],
  };
}

function summarizeStatus(
  status: Exclude<AuditGuidanceAdaptationStatus, "insufficient_history">,
  signals: AuditGuidanceAdaptationSignalSummary,
): { summary: string; note: string; recommendedAdjustment: string; limitations: string[] } {
  switch (status) {
    case "counter_signaled":
      return {
        summary: compact(
          `Repeated effectiveness history now leans counter_signaled: aligned guidance has produced more negative than supportive movement across tracked layers, so trust should fall without triggering an automatic rewrite.`,
          260,
        ),
        note: compact(
          `counter_signaled: annotate current guidance as low trust for judgment. Recent repeated history shows ${signals.counterSignals} counter vs ${signals.supportiveSignals} supportive signals, with ${signals.alignedCounterSignals} aligned counter-signal cases.`,
          260,
        ),
        recommendedAdjustment: "Lower trust in the current synthesis, inspect missing context, and prefer bounded experiments over auto-tuning.",
        limitations: [
          "Signals remain correlational rather than causal.",
          "Multiple overlapping interventions can still confound attribution.",
        ],
      };
    case "divergence_watch":
      return {
        summary: compact(
          `Repeated history suggests divergence_watch: cycles that diverged from the guidance have recently looked more promising than aligned ones, so the synthesis may be missing important context.`,
          260,
        ),
        note: compact(
          `divergence_watch: divergent choices are outperforming aligned guidance often enough to warrant review. Alternative signals=${signals.alternativeSignals}; diverged alternative cases=${signals.divergedAlternativeSignals}.`,
          260,
        ),
        recommendedAdjustment: "Review whether the current guidance synthesis is overweighting the binding constraint or underweighting adjacent context.",
        limitations: [
          "Alternative signals do not prove the divergent choice caused the later improvement.",
          "A few strong divergent wins can still be dominated by unobserved confounders.",
        ],
      };
    case "provisionally_supportive":
      return {
        summary: compact(
          `Repeated history is provisionally_supportive: aligned guidance has recently correlated with more positive than negative movement, so the current synthesis has earned bounded trust.`,
          260,
        ),
        note: compact(
          `provisionally_supportive: keep the current guidance synthesis, but preserve advisory posture. Supportive signals=${signals.supportiveSignals}; counter signals=${signals.counterSignals}.`,
          260,
        ),
        recommendedAdjustment: "Retain the current synthesis and continue measuring whether the pattern persists across more cycles.",
        limitations: [
          "Supportive correlation does not prove causal guidance quality.",
          "Trust should still remain bounded and operator-visible.",
        ],
      };
    case "mixed_signals":
    default:
      return {
        summary: compact(
          `Repeated history is mixed_signals: the evidence is no longer thin, but it still points in competing directions, so the guidance should carry a mixed-trust annotation rather than a tuning decision.`,
          260,
        ),
        note: compact(
          `mixed_signals: keep the synthesis advisory and visibly uncertain. Supportive=${signals.supportiveSignals}, counter=${signals.counterSignals}, alternative=${signals.alternativeSignals}, mixed=${signals.mixedSignals}.`,
          260,
        ),
        recommendedAdjustment: "Avoid retuning and keep surfacing the mixed-trust signal until a clearer repeated pattern appears.",
        limitations: [
          "Evidence is sufficient for inspection but not decisive for retuning.",
          "Competing signals likely reflect overlapping interventions or weak comparability.",
        ],
      };
  }
}

function chooseStatus(
  missingThresholds: string[],
  signals: AuditGuidanceAdaptationSignalSummary,
): AuditGuidanceAdaptationStatus {
  if (missingThresholds.length > 0) {
    return "insufficient_history";
  }

  if (
    signals.counterSignals >= 2
    && signals.counterSignals > signals.supportiveSignals
    && signals.counterSignals >= signals.alternativeSignals
    && signals.alignedCounterSignals >= 1
  ) {
    return "counter_signaled";
  }

  if (
    signals.alternativeSignals >= 2
    && signals.alternativeSignals > signals.supportiveSignals
    && signals.divergedAlternativeSignals >= 1
  ) {
    return "divergence_watch";
  }

  if (
    signals.supportiveSignals >= 2
    && signals.supportiveSignals > signals.counterSignals
    && signals.supportiveSignals >= signals.alternativeSignals
  ) {
    return "provisionally_supportive";
  }

  return "mixed_signals";
}

export function createAuditGuidanceAdaptationReport(): AuditGuidanceAdaptationReport {
  const thresholds = { ...DEFAULT_THRESHOLDS };
  const outcomes = loadAuditGuidanceOutcomeHistory(0);
  const persistedEffectiveness = loadAuditGuidanceEffectivenessHistory(0);
  const currentEffectiveness = createAuditGuidanceEffectivenessReport(outcomes);
  const recentSnapshots = loadAuditSnapshotHistory(5);
  const latestSnapshot = latestAuditSnapshot();
  const signals = verdictCounts(currentEffectiveness);
  const corpus: AuditGuidanceAdaptationCorpusSummary = {
    persistedEffectivenessReports: persistedEffectiveness.length,
    guidanceOutcomes: outcomes.length,
    comparableItems: currentEffectiveness?.items.filter((item) => item.verdict !== "insufficient_evidence").length ?? 0,
    linkedPostRunAudits: currentEffectiveness?.linkedPostRunAuditCount ?? 0,
    alignedOutcomes: outcomes.filter((item) => item.alignment.status === "aligned").length,
    partiallyAlignedOutcomes: outcomes.filter((item) => item.alignment.status === "partially_aligned").length,
    divergedOutcomes: outcomes.filter((item) => item.alignment.status === "diverged").length,
    floorEscalations: currentEffectiveness?.floorEscalationCount ?? 0,
    recentSnapshotCount: recentSnapshots.length,
  };
  const missingThresholds = listMissingThresholds(thresholds, corpus);
  const status = chooseStatus(missingThresholds, signals);
  const details = status === "insufficient_history"
    ? summarizeInsufficientHistory(corpus, thresholds, signals)
    : summarizeStatus(status, signals);
  const generatedAt = nowIso();

  return {
    reportId: createReportId(generatedAt),
    generatedAt,
    status,
    advisoryOnly: true,
    autoOverrideProhibited: true,
    thresholds,
    corpus,
    signals,
    latestContext: {
      snapshotId: latestSnapshot?.snapshotId ?? null,
      bindingConstraint: latestSnapshot?.bindingConstraint.dimension ?? null,
      effectivenessReportId: currentEffectiveness?.reportId ?? null,
    },
    summary: details.summary,
    note: details.note,
    recommendedAdjustment: details.recommendedAdjustment,
    missingThresholds,
    limitations: [
      ...details.limitations,
      "This report may annotate guidance trust, but it may not auto-overwrite the current audit recommendation.",
    ],
  };
}

export function persistAuditGuidanceAdaptationReport(report: AuditGuidanceAdaptationReport): string {
  const fullPath = join(ensureAuditGuidanceAdaptationDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function loadAuditGuidanceAdaptationHistory(limit = 10): AuditGuidanceAdaptationReport[] {
  const directory = ensureAuditGuidanceAdaptationDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditGuidanceAdaptationReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditGuidanceAdaptationReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditGuidanceAdaptationReport(): AuditGuidanceAdaptationReport | null {
  return loadAuditGuidanceAdaptationHistory(1)[0] ?? null;
}

export function buildAuditGuidanceAdaptationNote(report: AuditGuidanceAdaptationReport, maxLength = 220): string {
  return compact(report.note, maxLength);
}

export function formatAuditGuidanceAdaptationReport(report: AuditGuidanceAdaptationReport): string {
  return [
    `Audit guidance adaptation @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Status: ${report.status}`,
    `Summary: ${report.summary}`,
    `Guidance note: ${report.note}`,
    `Recommended adjustment: ${report.recommendedAdjustment}`,
    `Advisory only: ${report.advisoryOnly ? "yes" : "no"}`,
    `Auto-override prohibited: ${report.autoOverrideProhibited ? "yes" : "no"}`,
    `Thresholds: reports>=${report.thresholds.minimumPersistedEffectivenessReports}, outcomes>=${report.thresholds.minimumGuidanceOutcomes}, comparable>=${report.thresholds.minimumComparableItems}, linked-audits>=${report.thresholds.minimumLinkedPostRunAudits}`,
    `Corpus: reports=${report.corpus.persistedEffectivenessReports}, outcomes=${report.corpus.guidanceOutcomes}, comparable=${report.corpus.comparableItems}, linked-audits=${report.corpus.linkedPostRunAudits}, aligned=${report.corpus.alignedOutcomes}, partial=${report.corpus.partiallyAlignedOutcomes}, diverged=${report.corpus.divergedOutcomes}, floor-escalations=${report.corpus.floorEscalations}`,
    `Signals: dominant=${report.signals.dominantVerdict}, supportive=${report.signals.supportiveSignals}, counter=${report.signals.counterSignals}, alternative=${report.signals.alternativeSignals}, mixed=${report.signals.mixedSignals}, insufficient=${report.signals.insufficientEvidence}`,
    `Latest context: snapshot=${report.latestContext.snapshotId ?? "none"}, binding=${report.latestContext.bindingConstraint ?? "none"}, effectiveness=${report.latestContext.effectivenessReportId ?? "none"}`,
    `Missing thresholds: ${report.missingThresholds.join("; ") || "none"}`,
    `Limitations: ${report.limitations.join(" ")}`,
  ].join("\n");
}
