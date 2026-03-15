import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { memoryRoot, projectRoot } from "./lib";

export type AuditLoopQuickVerification = {
  requestedMode?: string;
  result?: string;
  verificationState?: string;
};

export type AuditLoopReport = {
  loopId: string;
  generatedAt: string;
  orchestrationSource?: string;
  sessionPath?: string | null;
  relatedCycleId?: string | null;
  relatedChangeId?: string | null;
  snapshotId: string;
  snapshotPath: string;
  outcomeReportId?: string | null;
  outcomeReportPath?: string | null;
  verificationRecordId: string;
  verification?: AuditLoopQuickVerification;
  recoveryId?: string | null;
  summary: string;
};

export type AuditLoopReportRecord = {
  report: AuditLoopReport;
  fullPath: string;
  relativePath: string;
};

const auditRadarLoopsRoot = resolve(memoryRoot, "knowledge", "audit-radar", "loops");

function projectRelativePath(fullPath: string): string {
  return relative(projectRoot, fullPath).replace(/\\/g, "/");
}

function isAuditLoopReport(value: unknown): value is AuditLoopReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditLoopReport>;
  return typeof candidate.loopId === "string"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.snapshotId === "string"
    && typeof candidate.snapshotPath === "string"
    && typeof candidate.verificationRecordId === "string"
    && typeof candidate.summary === "string";
}

function toRecord(fullPath: string): AuditLoopReportRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isAuditLoopReport(parsed)) {
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

export function readAuditLoopHistory(limit = 10): AuditLoopReportRecord[] {
  if (!existsSync(auditRadarLoopsRoot)) {
    return [];
  }

  const records = readdirSync(auditRadarLoopsRoot)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => resolve(auditRadarLoopsRoot, name))
    .map((fullPath) => toRecord(fullPath))
    .filter((record): record is AuditLoopReportRecord => record !== null)
    .sort((left, right) => right.report.generatedAt.localeCompare(left.report.generatedAt));

  return limit > 0 ? records.slice(0, limit) : records;
}

export function readAuditLoopReportByRelativePath(relativePath: string | null | undefined): AuditLoopReportRecord | null {
  const normalized = String(relativePath ?? "").trim();
  if (!normalized) {
    return null;
  }

  const fullPath = resolve(projectRoot, normalized);
  if (!existsSync(fullPath)) {
    return null;
  }

  return toRecord(fullPath);
}

export function summarizeAuditLoopVerification(report: AuditLoopReport | null | undefined): string {
  const mode = report?.verification?.requestedMode ?? "none";
  const result = report?.verification?.result ?? "none";
  return `${mode}/${result}`;
}

export function summarizeAuditLoopReport(record: AuditLoopReportRecord | null): string {
  if (!record) {
    return "No durable audit loop report";
  }

  return `${record.report.orchestrationSource ?? "unknown"} · ${summarizeAuditLoopVerification(record.report)}`;
}
