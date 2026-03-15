import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";
import { getAiesPaths } from "../shared/paths.ts";

function normalizeSnapshotFileName(snapshot: LayerAuditSnapshot): string {
  const safeObservedAt = snapshot.observedAt.replace(/[:.]/g, "-");
  const safeSnapshotId = snapshot.snapshotId.replace(/[^a-zA-Z0-9-_]/g, "-");
  return `${safeObservedAt}--${safeSnapshotId}.json`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function isLayerAuditSnapshot(value: unknown): value is LayerAuditSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LayerAuditSnapshot>;
  return typeof candidate.snapshotId === "string"
    && typeof candidate.observedAt === "string"
    && Array.isArray(candidate.dimensions)
    && Array.isArray(candidate.evidence)
    && typeof candidate.summary === "string"
    && Boolean(candidate.bindingConstraint)
    && Boolean(candidate.recommendedNextStep);
}

export function ensureAuditSnapshotDirectory(): string {
  const paths = getAiesPaths();
  mkdirSync(paths.auditRadarSnapshotsRoot, { recursive: true });
  return paths.auditRadarSnapshotsRoot;
}

export function loadAuditSnapshotHistory(limit = 25): LayerAuditSnapshot[] {
  const directory = ensureAuditSnapshotDirectory();
  if (!existsSync(directory)) {
    return [];
  }

  const snapshots = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(directory, name))
    .map((fullPath) => {
      try {
        const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
        return isLayerAuditSnapshot(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((snapshot): snapshot is LayerAuditSnapshot => snapshot !== null)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  return limit > 0 ? snapshots.slice(-limit) : snapshots;
}

export function latestAuditSnapshot(): LayerAuditSnapshot | null {
  const history = loadAuditSnapshotHistory(1);
  return history[0] ?? null;
}

export function persistAuditSnapshot(snapshot: LayerAuditSnapshot): string {
  const directory = ensureAuditSnapshotDirectory();
  const fullPath = join(directory, normalizeSnapshotFileName(snapshot));
  writeFileSync(fullPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return projectRelativePath(fullPath);
}
