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

interface MinimalAuditGuidanceAdaptationReport {
  reportId: string;
  generatedAt: string;
  status: string;
  note: string;
  summary: string;
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

export interface AuditGuidanceAdaptationReportRecord {
  report: MinimalAuditGuidanceAdaptationReport;
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

function isAuditGuidanceAdaptationReport(value: unknown): value is MinimalAuditGuidanceAdaptationReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MinimalAuditGuidanceAdaptationReport>;
  return typeof candidate.reportId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.status === "string"
    && typeof candidate.note === "string"
    && typeof candidate.summary === "string";
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

function toAdaptationRecord(fullPath: string): AuditGuidanceAdaptationReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditGuidanceAdaptationReport(parsed)) {
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

export function readAuditGuidanceAdaptationReportByRelativePath(
  relativePath: string | null | undefined,
): AuditGuidanceAdaptationReportRecord | null {
  const fullPath = resolveRelativeProjectPath(relativePath);
  return fullPath ? toAdaptationRecord(fullPath) : null;
}
