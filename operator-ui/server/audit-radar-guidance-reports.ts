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

interface MinimalAuditGuidanceExperimentReviewReport {
  reportId: string;
  generatedAt: string;
  experimentType: string;
  recommendedNextPosture: string;
  plannedRelevantCycles: number;
  observedRelevantCycles: number;
  executionStatus: string;
  signalDirection: string;
  summary: string;
}

interface MinimalAuditGuidanceExperimentDecisionReport {
  reportId: string;
  generatedAt: string;
  experimentType: string;
  experimentRecommendedPosture: string;
  decisionType: string;
  recommendedGuidancePosture: string;
  summary: string;
  recommendationNote: string;
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

export interface AuditGuidanceExperimentReviewReportRecord {
  report: MinimalAuditGuidanceExperimentReviewReport;
  fullPath: string;
  relativePath: string;
}

export interface AuditGuidanceExperimentDecisionReportRecord {
  report: MinimalAuditGuidanceExperimentDecisionReport;
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

function isAuditGuidanceExperimentReviewReport(value: unknown): value is MinimalAuditGuidanceExperimentReviewReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceExperimentReviewReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.experimentType === "string"
    && typeof candidate.recommendedNextPosture === "string"
    && typeof candidate.plannedRelevantCycles === "number"
    && typeof candidate.observedRelevantCycles === "number"
    && typeof candidate.executionStatus === "string"
    && typeof candidate.signalDirection === "string"
    && typeof candidate.summary === "string";
}

function isAuditGuidanceExperimentDecisionReport(value: unknown): value is MinimalAuditGuidanceExperimentDecisionReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceExperimentDecisionReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.experimentType === "string"
    && typeof candidate.experimentRecommendedPosture === "string"
    && typeof candidate.decisionType === "string"
    && typeof candidate.recommendedGuidancePosture === "string"
    && typeof candidate.summary === "string"
    && typeof candidate.recommendationNote === "string";
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

function toExperimentReviewRecord(fullPath: string): AuditGuidanceExperimentReviewReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceExperimentReviewReport(parsed)) {
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

function toExperimentDecisionRecord(fullPath: string): AuditGuidanceExperimentDecisionReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceExperimentDecisionReport(parsed)) {
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

export function readAuditGuidanceExperimentReviewReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceExperimentReviewReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toExperimentReviewRecord(fullPath) : null;
}

export function readAuditGuidanceExperimentDecisionReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceExperimentDecisionReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toExperimentDecisionRecord(fullPath) : null;
}
