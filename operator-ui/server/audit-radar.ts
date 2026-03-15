import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { memoryRoot, projectRoot } from "./lib";

type AuditRadarSnapshot = {
  snapshotId: string;
  observedAt: string;
  summary: string;
  confidence: string;
  bindingConstraint?: {
    dimension?: string;
    rationale?: string;
  };
  drift?: {
    summary?: string;
  } | null;
  recommendedNextStep?: {
    summary?: string;
    actionType?: string;
    targetDimensions?: string[];
    suggestedPaths?: string[];
  };
  failurePatterns?: string[];
};

export type AuditRadarReport = {
  snapshot: AuditRadarSnapshot;
  fullPath: string;
  relativePath: string;
};

const auditRadarSnapshotsRoot = resolve(memoryRoot, "knowledge", "audit-radar", "snapshots");

function projectRelativePath(fullPath: string): string {
  return relative(projectRoot, fullPath).replace(/\\/g, "/");
}

function isAuditRadarSnapshot(value: unknown): value is AuditRadarSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuditRadarSnapshot>;
  return typeof candidate.snapshotId === "string"
    && typeof candidate.observedAt === "string"
    && typeof candidate.summary === "string"
    && typeof candidate.confidence === "string";
}

export function readLatestAuditRadarReport(): AuditRadarReport | null {
  if (!existsSync(auditRadarSnapshotsRoot)) {
    return null;
  }

  const fullPath = readdirSync(auditRadarSnapshotsRoot)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))
    .map((name) => resolve(auditRadarSnapshotsRoot, name))
    .find((candidatePath) => {
      try {
        const parsed = JSON.parse(readFileSync(candidatePath, "utf8")) as unknown;
        return isAuditRadarSnapshot(parsed);
      } catch {
        return false;
      }
    });

  if (!fullPath) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
  if (!isAuditRadarSnapshot(parsed)) {
    return null;
  }

  return {
    snapshot: parsed,
    fullPath,
    relativePath: projectRelativePath(fullPath),
  };
}

export function summarizeAuditRadarReport(report: AuditRadarReport | null): string {
  if (!report) {
    return "No durable audit snapshot";
  }

  const binding = report.snapshot.bindingConstraint?.dimension ?? "unknown";
  const action = report.snapshot.recommendedNextStep?.actionType ?? "other";
  return `${binding} binding constraint · ${action} next step`;
}

export function trimAuditText(text: string | null | undefined, maxLength = 220): string {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "none";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function listAuditValues(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(",") : "none";
}
