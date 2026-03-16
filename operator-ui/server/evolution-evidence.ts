import { existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  EvolutionEvidenceArtifactType,
  EvolutionEvidenceConfidence,
  EvolutionEvidenceIndex,
  EvolutionEvidenceQuery,
} from "../../aies/contracts/evolution-evidence-index.ts";
import type { AiesDimension } from "../../aies/contracts/primitives.ts";
import {
  buildEvolutionEvidenceBrief,
  buildEvolutionEvidenceBriefs,
  type EvolutionEvidencePresetId,
} from "../../aies/extensions/evidence/evolution-evidence-brief.ts";
import {
  loadLatestEvolutionEvidenceIndex,
  queryEvolutionEvidenceIndex,
} from "../../aies/extensions/evidence/evolution-evidence-index.ts";
import { getAiesPaths } from "../../aies/extensions/shared/paths.ts";
import { projectRoot } from "./lib";

const AIES_DIMENSION_VALUES: readonly AiesDimension[] = [
  "prompt",
  "context",
  "intent",
  "judgment",
  "coherence",
  "evaluation",
  "harness",
];

const EVOLUTION_EVIDENCE_ARTIFACT_TYPE_VALUES: readonly EvolutionEvidenceArtifactType[] = [
  "dimension_anchor",
  "path_anchor",
  "openspec_change",
  "devlog",
  "knowledge_decision",
  "theory_note",
  "audit_snapshot",
  "audit_outcome",
  "audit_loop",
  "guidance_outcome",
  "guidance_effectiveness",
  "guidance_adaptation",
];

const EVOLUTION_EVIDENCE_CONFIDENCE_VALUES: readonly EvolutionEvidenceConfidence[] = ["direct", "heuristic"];

const EVOLUTION_EVIDENCE_PRESET_ID_VALUES: readonly EvolutionEvidencePresetId[] = [
  "recent_evaluation_interventions",
  "binding_constraint_support",
  "harness_verification_threads",
];

export interface EvolutionEvidenceIndexRecord {
  index: EvolutionEvidenceIndex;
  relativePath: string;
  stale: boolean;
  ageHours: number;
  generatedAt: string;
}

function parseCsvList(value: string | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compact(text: string | null | undefined, maxLength = 220): string {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "none";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(projectRoot, fullPath).replace(/\\/g, "/");
}

function asDimensions(values: string[]): AiesDimension[] {
  return values.filter((value): value is AiesDimension => AIES_DIMENSION_VALUES.includes(value as AiesDimension));
}

function asArtifactTypes(values: string[]): EvolutionEvidenceArtifactType[] {
  return values.filter((value): value is EvolutionEvidenceArtifactType =>
    EVOLUTION_EVIDENCE_ARTIFACT_TYPE_VALUES.includes(value as EvolutionEvidenceArtifactType));
}

function asConfidence(values: string[]): EvolutionEvidenceConfidence[] {
  return values.filter((value): value is EvolutionEvidenceConfidence =>
    EVOLUTION_EVIDENCE_CONFIDENCE_VALUES.includes(value as EvolutionEvidenceConfidence));
}

export function readLatestEvolutionEvidenceIndexRecord(): EvolutionEvidenceIndexRecord | null {
  const latestPath = join(getAiesPaths().evolutionEvidenceIndexRoot, "latest.json");
  const index = loadLatestEvolutionEvidenceIndex();
  if (!index || !existsSync(latestPath)) {
    return null;
  }

  const generatedAt = index.generatedAt;
  const ageMs = Math.max(0, Date.now() - Date.parse(generatedAt));
  return {
    index,
    relativePath: projectRelativePath(latestPath),
    stale: ageMs > 1000 * 60 * 60 * 12,
    ageHours: Number((ageMs / (1000 * 60 * 60)).toFixed(2)),
    generatedAt,
  };
}

export function parseEvolutionEvidenceQuery(searchParams: URLSearchParams): EvolutionEvidenceQuery {
  const maxNodes = Number.parseInt(searchParams.get("maxNodes") ?? "6", 10);
  const parsedMaxNodes = Number.isFinite(maxNodes) ? Math.min(Math.max(maxNodes, 1), 20) : 6;
  return {
    dimensions: asDimensions(parseCsvList(searchParams.get("dimension"))),
    changeIds: parseCsvList(searchParams.get("changeId")),
    artifactTypes: asArtifactTypes(parseCsvList(searchParams.get("artifactType"))),
    confidence: asConfidence(parseCsvList(searchParams.get("confidence"))),
    createdAfter: searchParams.get("createdAfter") ?? undefined,
    createdBefore: searchParams.get("createdBefore") ?? undefined,
    text: searchParams.get("text") ?? undefined,
    maxNodes: parsedMaxNodes,
  };
}

export function parseEvolutionEvidencePreset(searchParams: URLSearchParams): EvolutionEvidencePresetId | null {
  const preset = searchParams.get("preset");
  return EVOLUTION_EVIDENCE_PRESET_ID_VALUES.includes(preset as EvolutionEvidencePresetId)
    ? preset as EvolutionEvidencePresetId
    : null;
}

export function buildEvolutionEvidencePanelData(record: EvolutionEvidenceIndexRecord | null) {
  if (!record) {
    return {
      summary: "No persisted evolution evidence index found",
      bullets: [
        "index=missing",
        "nodes=0",
        "relations=0",
        "presets=0",
      ],
      detail: {
        index: null,
        briefs: [],
        note: "Build the evidence index before relying on query-backed continuity.",
      },
      provenance: {
        sourceType: "inferred" as const,
        sourceLabel: "memory/knowledge/evolution-evidence-index/latest.json",
        sourceTimestamp: null,
        relatedCycleId: null,
        relatedChangeId: "CHG-2026-03-16-evolution-evidence-index",
        stale: true,
      },
    };
  }

  const briefs = buildEvolutionEvidenceBriefs(record.index);
  const latestSnapshot = record.index.nodes
    .filter((node) => node.artifactType === "audit_snapshot")
    .slice()
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))[0] ?? null;

  return {
    summary: compact(`Indexed ${record.index.summary.nodeCount} nodes / ${record.index.summary.relationCount} relations. Latest binding-constraint evidence anchor: ${latestSnapshot?.title ?? "none"}.`),
    bullets: [
      `indexPath=${record.relativePath}`,
      `generatedAt=${record.generatedAt}`,
      `ageHours=${record.ageHours}`,
      `nodes=${record.index.summary.nodeCount}`,
      `relations=${record.index.summary.relationCount}`,
      `presets=${briefs.length}`,
      `stale=${record.stale}`,
    ],
    detail: {
      index: {
        generatedAt: record.generatedAt,
        advisoryOnly: record.index.advisoryOnly,
        sourceRoots: record.index.sourceRoots,
        summary: record.index.summary,
      },
      latestSnapshot,
      briefs,
    },
    provenance: {
      sourceType: "file-backed" as const,
      sourceLabel: record.relativePath,
      sourceTimestamp: record.generatedAt,
      relatedCycleId: null,
      relatedChangeId: "CHG-2026-03-16-evolution-evidence-index",
      stale: record.stale,
    },
  };
}

export function executeEvolutionEvidenceQuery(record: EvolutionEvidenceIndexRecord | null, searchParams: URLSearchParams) {
  if (!record) {
    return {
      ok: false,
      error: "No persisted evolution evidence index found.",
    };
  }

  const preset = parseEvolutionEvidencePreset(searchParams);
  if (preset) {
    const brief = buildEvolutionEvidenceBrief(record.index, preset);
    return {
      ok: true,
      mode: "preset",
      preset,
      brief,
      index: {
        generatedAt: record.generatedAt,
        relativePath: record.relativePath,
        stale: record.stale,
      },
    };
  }

  const query = parseEvolutionEvidenceQuery(searchParams);
  const result = queryEvolutionEvidenceIndex(record.index, query);
  return {
    ok: true,
    mode: "query",
    query,
    result,
    index: {
      generatedAt: record.generatedAt,
      relativePath: record.relativePath,
      stale: record.stale,
      fileUpdatedAt: statSync(join(projectRoot, record.relativePath)).mtime.toISOString(),
    },
  };
}
