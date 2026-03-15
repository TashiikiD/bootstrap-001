import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { LayerAuditAssessment, LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";
import { AIES_DIMENSIONS, type AiesDimension } from "../../contracts/primitives.ts";
import type { OpenSpecEntry } from "../openspec/state.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { auditSnapshotRelativePath } from "./audit-radar-state.ts";

type ActiveChangeTarget = {
  changeId: string;
  title: string | null;
  relativePath: string;
  markdown: string;
};

export type AuditReconciliationDraft = {
  mode: "reconciled_active_change";
  changeId: string;
  title: string | null;
  relativePath: string;
  selectedDimension: AiesDimension;
  sourceSnapshotPath: string;
  markdown: string;
  addedTask: boolean;
  reason: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstNonStrongDimension(snapshot: LayerAuditSnapshot): AiesDimension {
  const stagnantCandidate = snapshot.drift?.stagnantDimensions.find((dimension) =>
    snapshot.dimensions.some((item) => item.dimension === dimension && item.tier !== "strong"));

  if (stagnantCandidate) {
    return stagnantCandidate;
  }

  return snapshot.dimensions.find((item) => item.tier !== "strong")?.dimension ?? snapshot.bindingConstraint.dimension;
}

function resolveDimension(rawArgs: string | undefined, snapshot: LayerAuditSnapshot): AiesDimension {
  const requested = (rawArgs ?? "").trim().toLowerCase();
  if ((AIES_DIMENSIONS as readonly string[]).includes(requested)) {
    return requested as AiesDimension;
  }
  return firstNonStrongDimension(snapshot);
}

function selectAssessment(snapshot: LayerAuditSnapshot, dimension: AiesDimension): LayerAuditAssessment {
  const selected = snapshot.dimensions.find((item) => item.dimension === dimension)
    ?? snapshot.dimensions.find((item) => item.dimension === snapshot.bindingConstraint.dimension)
    ?? snapshot.dimensions[0];

  if (!selected) {
    throw new Error("Audit snapshot does not contain any dimension assessments.");
  }

  return selected;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function resolveActiveChange(entry: OpenSpecEntry | null): ActiveChangeTarget | null {
  if (!entry?.context.activeChangeId || !entry.sourcePath || !existsSync(entry.sourcePath)) {
    return null;
  }

  return {
    changeId: entry.context.activeChangeId,
    title: entry.title,
    relativePath: projectRelativePath(entry.sourcePath),
    markdown: readFileSync(entry.sourcePath, "utf8").replace(/\r\n/g, "\n"),
  };
}

function shouldReconcile(activeChange: ActiveChangeTarget, snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment): { ok: boolean; reason: string } {
  const searchable = normalize([activeChange.changeId, activeChange.title ?? "", activeChange.markdown].join(" "));
  const reasons: string[] = [];

  if (searchable.includes("audit")) {
    reasons.push("the active change already targets audit/planning behavior");
  }
  if (searchable.includes(normalize(assessment.dimension))) {
    reasons.push(`the active change already references ${assessment.dimension}`);
  }
  if (searchable.includes(normalize(snapshot.bindingConstraint.dimension))) {
    reasons.push(`the active change already references the current binding constraint (${snapshot.bindingConstraint.dimension})`);
  }

  if (reasons.length === 0) {
    return {
      ok: false,
      reason: "The active change does not appear aligned with the latest audit target, so a new proposal is safer than mutating it automatically.",
    };
  }

  return {
    ok: true,
    reason: `Reconciled into the active change because ${reasons.join("; ")}.`,
  };
}

function upsertFrontmatterScalar(markdown: string, key: string, value: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }

  const pattern = new RegExp(`^(${escapeRegExp("---\n")}[\\s\\S]*?\n)${escapeRegExp(key)}:\\s*.*$`, "m");
  if (pattern.test(normalized)) {
    return normalized.replace(pattern, `$1${key}: ${value}`);
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return normalized;
  }

  return `${normalized.slice(0, closingIndex)}\n${key}: ${value}${normalized.slice(closingIndex)}`;
}

function taskBlock(snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment): string {
  const evidence = assessment.evidenceIds.length > 0 ? assessment.evidenceIds.join(", ") : "none";
  return [
    `- [ ] Reconcile audit snapshot \`${snapshot.snapshotId}\` into this change's plan.`,
    `  - Binding constraint: \`${snapshot.bindingConstraint.dimension}\`; selected dimension: \`${assessment.dimension}\`.`,
    `  - Implement: ${assessment.highestLeverageNextStep}`,
    `  - Evidence IDs: ${evidence}`,
  ].join("\n");
}

function appendTaskBlock(markdown: string, snapshotId: string, block: string): { markdown: string; addedTask: boolean } {
  if (markdown.includes(`Reconcile audit snapshot \`${snapshotId}\` into this change's plan.`)) {
    return { markdown, addedTask: false };
  }

  const pattern = /\n## Tasks\n([\s\S]*?)(?=\n## |$)/;
  const match = markdown.match(pattern);
  if (!match) {
    return {
      markdown: `${markdown.trimEnd()}\n\n## Tasks\n${block}\n`,
      addedTask: true,
    };
  }

  const existingBody = match[1].trimEnd();
  const updatedSection = `\n## Tasks\n${existingBody}\n${existingBody ? "\n" : ""}${block}\n`;
  return {
    markdown: markdown.replace(pattern, updatedSection),
    addedTask: true,
  };
}

function appendReconciliationEntry(markdown: string, snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment, reason: string, addedTask: boolean): string {
  if (markdown.includes(`### ${snapshot.snapshotId}`)) {
    return markdown;
  }

  const entry = [
    `### ${snapshot.snapshotId}`,
    `- observed_at: ${snapshot.observedAt}`,
    `- source_snapshot: ${auditSnapshotRelativePath(snapshot)}`,
    `- binding_constraint: ${snapshot.bindingConstraint.dimension}`,
    `- selected_dimension: ${assessment.dimension}`,
    `- decision: ${addedTask ? "merged audit findings into the active task queue" : "recorded alignment without adding a duplicate task"}`,
    `- rationale: ${reason}`,
    `- highest_leverage_next_step: ${assessment.highestLeverageNextStep}`,
    `- evidence_ids: ${assessment.evidenceIds.length > 0 ? assessment.evidenceIds.join(", ") : "none"}`,
    `- drift_summary: ${snapshot.drift?.summary ?? "none"}`,
  ].join("\n");

  const pattern = /\n## Audit Radar Reconciliation\n([\s\S]*?)(?=\n## |$)/;
  const match = markdown.match(pattern);
  if (!match) {
    return `${markdown.trimEnd()}\n\n## Audit Radar Reconciliation\n${entry}\n`;
  }

  const existingBody = match[1].trimEnd();
  const updatedSection = `\n## Audit Radar Reconciliation\n${existingBody}${existingBody ? "\n\n" : ""}${entry}\n`;
  return markdown.replace(pattern, updatedSection);
}

export function createAuditReconciliationDraft(snapshot: LayerAuditSnapshot, entry: OpenSpecEntry | null, rawArgs = ""): AuditReconciliationDraft | null {
  const activeChange = resolveActiveChange(entry);
  if (!activeChange) {
    return null;
  }

  const selectedDimension = resolveDimension(rawArgs, snapshot);
  const assessment = selectAssessment(snapshot, selectedDimension);
  const reconciliation = shouldReconcile(activeChange, snapshot, assessment);
  if (!reconciliation.ok) {
    return null;
  }

  const withMetadata = [
    ["updated_at", snapshot.observedAt],
    ["last_audit_snapshot", snapshot.snapshotId],
    ["last_audit_reconciled_dimension", assessment.dimension],
  ].reduce((current, [key, value]) => upsertFrontmatterScalar(current, key, value), activeChange.markdown);

  const appendedTask = appendTaskBlock(withMetadata, snapshot.snapshotId, taskBlock(snapshot, assessment));
  const finalMarkdown = appendReconciliationEntry(appendedTask.markdown, snapshot, assessment, reconciliation.reason, appendedTask.addedTask);

  return {
    mode: "reconciled_active_change",
    changeId: activeChange.changeId,
    title: activeChange.title,
    relativePath: activeChange.relativePath,
    selectedDimension: assessment.dimension,
    sourceSnapshotPath: auditSnapshotRelativePath(snapshot),
    markdown: `${finalMarkdown.trimEnd()}\n`,
    addedTask: appendedTask.addedTask,
    reason: reconciliation.reason,
  };
}

export function persistAuditReconciliationDraft(draft: AuditReconciliationDraft): string {
  const fullPath = join(getAiesPaths().projectRoot, draft.relativePath);
  writeFileSync(fullPath, draft.markdown, "utf8");
  return draft.relativePath;
}
