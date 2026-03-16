import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { projectRoot } from "./lib";

interface MinimalAuditGuidanceOutcomeReport {
  reportId: string;
  generatedAt: string;
  alignment: {
    status: string;
    summary: string;
  };
}

interface MinimalAuditGuidanceEffectivenessItem {
  guidanceOutcomeReportId: string;
  verdict: string;
  summary: string;
}

interface MinimalAuditGuidanceEffectivenessReport {
  reportId: string;
  generatedAt: string;
  summary: string;
  items: MinimalAuditGuidanceEffectivenessItem[];
}

interface MinimalAuditGuidanceLearningReviewBucket {
  posture: string;
  itemCount: number;
  summary: string;
}

interface MinimalAuditGuidanceLearningReviewReport {
  reportId: string;
  generatedAt: string;
  summary: string;
  strongestPosture: string | null;
  weakestPosture: string | null;
  buckets: MinimalAuditGuidanceLearningReviewBucket[];
}

interface MinimalAuditGuidanceExperimentReport {
  reportId: string;
  generatedAt: string;
  experimentType: string;
  recommendedNextPosture: string;
  summary: string;
  rationale: string;
  guardrails: string[];
}

export interface AuditGuidanceOutcomeReportRecord {
  report: MinimalAuditGuidanceOutcomeReport;
  fullPath: string;
  relativePath: string;
}

export interface AuditGuidanceEffectivenessReportRecord {
  report: MinimalAuditGuidanceEffectivenessReport;
  fullPath: string;
  relativePath: string;
}

export interface AuditGuidanceLearningReviewReportRecord {
  report: MinimalAuditGuidanceLearningReviewReport;
  fullPath: string;
  relativePath: string;
}

export interface AuditGuidanceExperimentReportRecord {
  report: MinimalAuditGuidanceExperimentReport;
  fullPath: string;
  relativePath: string;
}

function projectRelativePath(fullPath: string): string {
  return relative(projectRoot, fullPath).replace(/\\/g, "/");
}

function resolveRelativeProjectPath(relativePath: string | null | undefined): string | null {
  const normalized = String(relativePath ?? "").trim();
  if (!normalized) {
    return null;
  }

  const fullPath = resolve(projectRoot, normalized);
  return existsSync(fullPath) ? fullPath : null;
}

function isAuditGuidanceOutcomeReport(value: unknown): value is MinimalAuditGuidanceOutcomeReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceOutcomeReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.alignment?.status === "string"
    && typeof candidate.alignment?.summary === "string";
}

function isAuditGuidanceEffectivenessItem(value: unknown): value is MinimalAuditGuidanceEffectivenessItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceEffectivenessItem>;
  return typeof candidate.guidanceOutcomeReportId === "string"
    && typeof candidate.verdict === "string"
    && typeof candidate.summary === "string";
}

function isAuditGuidanceEffectivenessReport(value: unknown): value is MinimalAuditGuidanceEffectivenessReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceEffectivenessReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.summary === "string"
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => isAuditGuidanceEffectivenessItem(item));
}

function isAuditGuidanceLearningReviewBucket(value: unknown): value is MinimalAuditGuidanceLearningReviewBucket {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceLearningReviewBucket>;
  return typeof candidate.posture === "string"
    && typeof candidate.itemCount === "number"
    && typeof candidate.summary === "string";
}

function isAuditGuidanceLearningReviewReport(value: unknown): value is MinimalAuditGuidanceLearningReviewReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceLearningReviewReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.summary === "string"
    && Array.isArray(candidate.buckets)
    && candidate.buckets.every((bucket) => isAuditGuidanceLearningReviewBucket(bucket));
}

function isAuditGuidanceExperimentReport(value: unknown): value is MinimalAuditGuidanceExperimentReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceExperimentReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.experimentType === "string"
    && typeof candidate.recommendedNextPosture === "string"
    && typeof candidate.summary === "string"
    && typeof candidate.rationale === "string"
    && Array.isArray(candidate.guardrails)
    && candidate.guardrails.every((item) => typeof item === "string");
}

function toOutcomeRecord(fullPath: string): AuditGuidanceOutcomeReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceOutcomeReport(parsed)) {
      return null;
    }

    return {
      report: parsed,
      fullPath,
      relativePath: projectRelativePath(fullPath),
    };
  } catch {
    return null;
  }
}

function toEffectivenessRecord(fullPath: string): AuditGuidanceEffectivenessReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceEffectivenessReport(parsed)) {
      return null;
    }

    return {
      report: parsed,
      fullPath,
      relativePath: projectRelativePath(fullPath),
    };
  } catch {
    return null;
  }
}

function toLearningReviewRecord(fullPath: string): AuditGuidanceLearningReviewReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceLearningReviewReport(parsed)) {
      return null;
    }

    return {
      report: parsed,
      fullPath,
      relativePath: projectRelativePath(fullPath),
    };
  } catch {
    return null;
  }
}

function toExperimentRecord(fullPath: string): AuditGuidanceExperimentReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceExperimentReport(parsed)) {
      return null;
    }

    return {
      report: parsed,
      fullPath,
      relativePath: projectRelativePath(fullPath),
    };
  } catch {
    return null;
  }
}

export function readAuditGuidanceOutcomeReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceOutcomeReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toOutcomeRecord(fullPath) : null;
}

export function readAuditGuidanceEffectivenessReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceEffectivenessReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toEffectivenessRecord(fullPath) : null;
}

export function readAuditGuidanceLearningReviewReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceLearningReviewReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toLearningReviewRecord(fullPath) : null;
}

export function readAuditGuidanceExperimentReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceExperimentReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toExperimentRecord(fullPath) : null;
}
