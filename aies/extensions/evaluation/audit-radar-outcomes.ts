import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesAuditTier, LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { OPENSPEC_ENTRY_TYPE } from "../openspec/state.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { listSessionPathsByRecency } from "../shared/session-paths.ts";
import { RECOVERY_ENTRY_TYPE, VERIFICATION_ENTRY_TYPE, VERIFICATION_MODE_ENTRY_TYPE } from "../verification/state.ts";
import { loadAuditSnapshotHistory } from "./audit-radar-state.ts";

export const AUDIT_CORRECTION_PATHS = [
  "audit_reconciliation",
  "audit_proposal",
  "verification_recorded",
  "recovery_opened",
  "recovery_resolved",
  "operator_verification_mode",
] as const;

export type AuditCorrectionPath = (typeof AUDIT_CORRECTION_PATHS)[number];

export interface AuditOutcomeComparison {
  previousSnapshotId: string;
  previousObservedAt: IsoTimestamp;
  currentSnapshotId: string;
  currentObservedAt: IsoTimestamp;
  comparedWeakDimensions: AiesDimension[];
  improvedDimensions: AiesDimension[];
  regressedDimensions: AiesDimension[];
  stagnantWeakDimensions: AiesDimension[];
  pathsObserved: AuditCorrectionPath[];
  pathEvidence: string[];
  summary: string;
}

export interface AuditOutcomeReport {
  reportId: string;
  generatedAt: IsoTimestamp;
  snapshotCount: number;
  comparisons: AuditOutcomeComparison[];
  summary: string;
}

type ParsedCustomEntry = {
  customType: string;
  timestamp: string | null;
  data: Record<string, unknown>;
  sessionPath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createReportId(): string {
  const generatedAt = nowIso().replace(/[:.]/g, "-");
  return `audit-outcomes-${generatedAt}`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBetween(timestamp: string | null, start: string, end: string): boolean {
  const instant = parseTime(timestamp);
  const startTime = parseTime(start);
  const endTime = parseTime(end);
  if (instant === null || startTime === null || endTime === null) {
    return false;
  }

  return instant > startTime && instant <= endTime;
}

function tierRank(tier: AiesAuditTier): number {
  if (tier === "missing") return 0;
  if (tier === "partial") return 1;
  return 2;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function listChangeMarkdown(): Array<{ relativePath: string; markdown: string }> {
  const directory = getAiesPaths().openSpecChangesRoot;
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((name) => /^CHG-.*\.md$/i.test(name))
    .map((name) => {
      const fullPath = join(directory, name);
      return {
        relativePath: projectRelativePath(fullPath),
        markdown: readFileSync(fullPath, "utf8").replace(/\r\n/g, "\n"),
      };
    });
}

function scanOpenSpecCorrectionPaths(snapshot: LayerAuditSnapshot): { paths: AuditCorrectionPath[]; evidence: string[] } {
  const paths = new Set<AuditCorrectionPath>();
  const evidence: string[] = [];

  for (const change of listChangeMarkdown()) {
    if (change.markdown.includes(`generated_from_audit_snapshot: ${snapshot.snapshotId}`)) {
      paths.add("audit_proposal");
      evidence.push(`${change.relativePath} generated_from_audit_snapshot=${snapshot.snapshotId}`);
    }

    if (change.markdown.includes(`### ${snapshot.snapshotId}`)) {
      paths.add("audit_reconciliation");
      evidence.push(`${change.relativePath} reconciles ${snapshot.snapshotId}`);
    }
  }

  return {
    paths: [...paths],
    evidence: uniqueStrings(evidence),
  };
}

function relevantSessionEntry(rawLine: string): boolean {
  return rawLine.includes(`\"customType\":\"${VERIFICATION_ENTRY_TYPE}\"`)
    || rawLine.includes(`\"customType\":\"${RECOVERY_ENTRY_TYPE}\"`)
    || rawLine.includes(`\"customType\":\"${VERIFICATION_MODE_ENTRY_TYPE}\"`)
    || rawLine.includes(`\"customType\":\"${OPENSPEC_ENTRY_TYPE}\"`);
}

function parseRelevantSessionEntries(): ParsedCustomEntry[] {
  const entries: ParsedCustomEntry[] = [];
  for (const sessionPath of listSessionPathsByRecency(getAiesPaths().sessionDir)) {
    if (!existsSync(sessionPath)) {
      continue;
    }

    const relativeSessionPath = projectRelativePath(sessionPath);
    const lines = readFileSync(sessionPath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.includes("\"type\":\"custom\"") || !relevantSessionEntry(line)) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          customType?: string;
          timestamp?: string;
          data?: Record<string, unknown>;
        };
        if (parsed.type !== "custom" || typeof parsed.customType !== "string" || !parsed.data || typeof parsed.data !== "object") {
          continue;
        }
        entries.push({
          customType: parsed.customType,
          timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : null,
          data: parsed.data,
          sessionPath: relativeSessionPath,
        });
      } catch {
        continue;
      }
    }
  }

  return entries;
}

function recordTimestamp(entry: ParsedCustomEntry): string | null {
  const data = entry.data;
  const createdAt = typeof data.createdAt === "string"
    ? data.createdAt
    : typeof data.updatedAt === "string"
      ? data.updatedAt
      : typeof data.record === "object" && data.record && typeof (data.record as { recordedAt?: unknown }).recordedAt === "string"
        ? (data.record as { recordedAt: string }).recordedAt
        : null;

  return createdAt ?? entry.timestamp;
}

function scanSessionCorrectionPaths(previous: LayerAuditSnapshot, current: LayerAuditSnapshot): { paths: AuditCorrectionPath[]; evidence: string[] } {
  const paths = new Set<AuditCorrectionPath>();
  const evidence: string[] = [];

  for (const entry of parseRelevantSessionEntries()) {
    if (!isBetween(recordTimestamp(entry), previous.observedAt, current.observedAt)) {
      continue;
    }

    if (entry.customType === VERIFICATION_ENTRY_TYPE) {
      const record = typeof entry.data.record === "object" && entry.data.record ? entry.data.record as { mode?: unknown; result?: unknown } : null;
      paths.add("verification_recorded");
      evidence.push(`${entry.sessionPath} verification ${String(record?.mode ?? "unknown")}/${String(record?.result ?? "unknown")}`);
      continue;
    }

    if (entry.customType === RECOVERY_ENTRY_TYPE) {
      const status = typeof entry.data.status === "string" ? entry.data.status : "unknown";
      const recoveryId = typeof entry.data.recoveryId === "string" ? entry.data.recoveryId : "unknown";
      if (status === "open") {
        paths.add("recovery_opened");
        evidence.push(`${entry.sessionPath} recovery open ${recoveryId}`);
      } else if (status === "resolved" || status === "deferred") {
        paths.add("recovery_resolved");
        evidence.push(`${entry.sessionPath} recovery ${status} ${recoveryId}`);
      }
      continue;
    }

    if (entry.customType === VERIFICATION_MODE_ENTRY_TYPE) {
      const source = typeof entry.data.source === "string" ? entry.data.source : "unknown";
      const mode = typeof entry.data.mode === "string" ? entry.data.mode : "unknown";
      if (source === "override" || source === "aligned_operator") {
        paths.add("operator_verification_mode");
        evidence.push(`${entry.sessionPath} verification-mode ${mode} (${source})`);
      }
    }
  }

  return {
    paths: [...paths],
    evidence: uniqueStrings(evidence),
  };
}

function compareWeakDimensions(previous: LayerAuditSnapshot, current: LayerAuditSnapshot): Pick<AuditOutcomeComparison, "comparedWeakDimensions" | "improvedDimensions" | "regressedDimensions" | "stagnantWeakDimensions"> {
  const currentByDimension = new Map(current.dimensions.map((assessment) => [assessment.dimension, assessment]));
  const comparedWeakDimensions: AiesDimension[] = [];
  const improvedDimensions: AiesDimension[] = [];
  const regressedDimensions: AiesDimension[] = [];
  const stagnantWeakDimensions: AiesDimension[] = [];

  for (const previousAssessment of previous.dimensions) {
    if (previousAssessment.tier === "strong") {
      continue;
    }

    const currentAssessment = currentByDimension.get(previousAssessment.dimension);
    if (!currentAssessment) {
      continue;
    }

    comparedWeakDimensions.push(previousAssessment.dimension);
    const previousRank = tierRank(previousAssessment.tier);
    const currentRank = tierRank(currentAssessment.tier);

    if (currentRank > previousRank) {
      improvedDimensions.push(previousAssessment.dimension);
    } else if (currentRank < previousRank) {
      regressedDimensions.push(previousAssessment.dimension);
    } else if (currentAssessment.tier !== "strong") {
      stagnantWeakDimensions.push(previousAssessment.dimension);
    }
  }

  return {
    comparedWeakDimensions,
    improvedDimensions,
    regressedDimensions,
    stagnantWeakDimensions,
  };
}

function formatPathLabel(path: AuditCorrectionPath): string {
  switch (path) {
    case "audit_reconciliation":
      return "audit reconciliation";
    case "audit_proposal":
      return "audit proposal";
    case "verification_recorded":
      return "verification record";
    case "recovery_opened":
      return "recovery opened";
    case "recovery_resolved":
      return "recovery resolved/deferred";
    case "operator_verification_mode":
      return "operator verification mode";
  }
}

function summarizeComparison(comparison: Omit<AuditOutcomeComparison, "summary">): string {
  const paths = comparison.pathsObserved.length > 0
    ? comparison.pathsObserved.map(formatPathLabel).join(", ")
    : "none observed";

  return [
    `Between ${comparison.previousSnapshotId} and ${comparison.currentSnapshotId}, observed correction paths: ${paths}.`,
    `Improved prior weak layers: ${comparison.improvedDimensions.length > 0 ? comparison.improvedDimensions.join(", ") : "none"}.`,
    `Regressed prior weak layers: ${comparison.regressedDimensions.length > 0 ? comparison.regressedDimensions.join(", ") : "none"}.`,
    `Stagnant prior weak layers: ${comparison.stagnantWeakDimensions.length > 0 ? comparison.stagnantWeakDimensions.join(", ") : "none"}.`,
  ].join(" ");
}

function buildComparison(previous: LayerAuditSnapshot, current: LayerAuditSnapshot): AuditOutcomeComparison {
  const weakDimensionDiff = compareWeakDimensions(previous, current);
  const openSpecSignals = scanOpenSpecCorrectionPaths(previous);
  const sessionSignals = scanSessionCorrectionPaths(previous, current);
  const pathsObserved = uniqueStrings([...openSpecSignals.paths, ...sessionSignals.paths]) as AuditCorrectionPath[];
  const pathEvidence = uniqueStrings([...openSpecSignals.evidence, ...sessionSignals.evidence]).slice(0, 10);

  const comparisonWithoutSummary: Omit<AuditOutcomeComparison, "summary"> = {
    previousSnapshotId: previous.snapshotId,
    previousObservedAt: previous.observedAt,
    currentSnapshotId: current.snapshotId,
    currentObservedAt: current.observedAt,
    ...weakDimensionDiff,
    pathsObserved,
    pathEvidence,
  };

  return {
    ...comparisonWithoutSummary,
    summary: summarizeComparison(comparisonWithoutSummary),
  };
}

function reportSummary(comparisons: AuditOutcomeComparison[], snapshotCount: number): string {
  const improvementCount = comparisons.filter((comparison) => comparison.improvedDimensions.length > 0).length;
  const stagnationCount = comparisons.filter((comparison) => comparison.stagnantWeakDimensions.length > 0).length;
  const pathCounts = new Map<AuditCorrectionPath, number>();

  for (const comparison of comparisons) {
    for (const path of comparison.pathsObserved) {
      pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
    }
  }

  const commonPaths = [...pathCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([path, count]) => `${formatPathLabel(path)} x${count}`);

  return [
    `Compared ${comparisons.length} audit interval${comparisons.length === 1 ? "" : "s"} across ${snapshotCount} snapshot${snapshotCount === 1 ? "" : "s"}.`,
    `Intervals with prior-weak-layer improvement: ${improvementCount}/${comparisons.length || 1}.`,
    `Intervals with stagnant weak layers: ${stagnationCount}/${comparisons.length || 1}.`,
    `Most common observed correction paths: ${commonPaths.length > 0 ? commonPaths.join(", ") : "none yet"}.`,
  ].join(" ");
}

function isAuditOutcomeReport(value: unknown): value is AuditOutcomeReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditOutcomeReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && Array.isArray(candidate.comparisons)
    && typeof candidate.summary === "string";
}

function normalizeReportFileName(report: AuditOutcomeReport): string {
  return `${report.generatedAt.replace(/[:.]/g, "-")}--${report.reportId.replace(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

export function ensureAuditOutcomeDirectory(): string {
  const root = getAiesPaths().auditRadarOutcomesRoot;
  mkdirSync(root, { recursive: true });
  return root;
}

export function auditOutcomeReportRelativePath(report: AuditOutcomeReport): string {
  return projectRelativePath(join(ensureAuditOutcomeDirectory(), normalizeReportFileName(report)));
}

export function loadAuditOutcomeReportHistory(limit = 10): AuditOutcomeReport[] {
  const directory = ensureAuditOutcomeDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const reports = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isAuditOutcomeReport(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((report): report is AuditOutcomeReport => report !== null)
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));

  return limit > 0 ? reports.slice(-limit) : reports;
}

export function latestAuditOutcomeReport(): AuditOutcomeReport | null {
  const reports = loadAuditOutcomeReportHistory(1);
  return reports[0] ?? null;
}

export function createAuditOutcomeReport(snapshots = loadAuditSnapshotHistory(0)): AuditOutcomeReport | null {
  if (snapshots.length < 2) {
    return null;
  }

  const comparisons: AuditOutcomeComparison[] = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (!previous || !current) {
      continue;
    }
    comparisons.push(buildComparison(previous, current));
  }

  return {
    reportId: createReportId(),
    generatedAt: nowIso(),
    snapshotCount: snapshots.length,
    comparisons,
    summary: reportSummary(comparisons, snapshots.length),
  };
}

export function persistAuditOutcomeReport(report: AuditOutcomeReport): string {
  const fullPath = join(ensureAuditOutcomeDirectory(), normalizeReportFileName(report));
  writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}

export function formatAuditOutcomeReport(report: AuditOutcomeReport, comparisonLimit = 3): string {
  const comparisons = report.comparisons.slice(-comparisonLimit).reverse();
  const lines = [
    `AIES audit outcome comparison @ ${report.generatedAt}`,
    `Report: ${report.reportId}`,
    `Summary: ${report.summary}`,
  ];

  for (const comparison of comparisons) {
    lines.push("");
    lines.push(`${comparison.currentSnapshotId} <= ${comparison.previousSnapshotId}`);
    lines.push(`Paths: ${comparison.pathsObserved.length > 0 ? comparison.pathsObserved.map(formatPathLabel).join(", ") : "none"}`);
    lines.push(`Improved: ${comparison.improvedDimensions.length > 0 ? comparison.improvedDimensions.join(", ") : "none"}`);
    lines.push(`Regressed: ${comparison.regressedDimensions.length > 0 ? comparison.regressedDimensions.join(", ") : "none"}`);
    lines.push(`Stagnant weak: ${comparison.stagnantWeakDimensions.length > 0 ? comparison.stagnantWeakDimensions.join(", ") : "none"}`);
    lines.push(`Evidence: ${comparison.pathEvidence.length > 0 ? comparison.pathEvidence.join(" | ") : "none"}`);
  }

  return lines.join("\n");
}
