import type { EvolutionEvidenceNode } from "../../contracts/evolution-evidence-index.ts";
import type { AiesDimension, IsoTimestamp } from "../../contracts/primitives.ts";
import { queryEvolutionEvidenceIndex, loadLatestEvolutionEvidenceIndex } from "./evolution-evidence-index.ts";

const LATEST_INDEX_PATH = "memory/knowledge/evolution-evidence-index/latest.json";
const STALE_AFTER_HOURS = 12;

export interface EvolutionEvidenceRuntimeItem {
  id: string;
  artifactType: string;
  title: string;
  sourcePath: string;
  createdAt: string | null;
  summary: string;
}

export interface EvolutionEvidenceRuntimeBrief {
  generatedAt: IsoTimestamp;
  sourcePath: string;
  stale: boolean;
  activeChangeId: string | null;
  bindingConstraint: AiesDimension | null;
  summary: string;
  uncertainty: string | null;
  items: EvolutionEvidenceRuntimeItem[];
}

function compact(text: string | null | undefined, maxLength = 240): string {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "none";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function toItem(node: EvolutionEvidenceNode): EvolutionEvidenceRuntimeItem {
  return {
    id: node.id,
    artifactType: node.artifactType,
    title: node.title,
    sourcePath: node.sourcePath,
    createdAt: node.createdAt,
    summary: node.summary,
  };
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function dedupeNodes(nodes: EvolutionEvidenceNode[]): EvolutionEvidenceNode[] {
  const seen = new Set<string>();
  const result: EvolutionEvidenceNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    result.push(node);
  }
  return result;
}

export function createEvolutionEvidenceRuntimeBrief(args: {
  activeChangeId: string | null;
  bindingConstraint: AiesDimension | null;
  maxItems?: number;
}): EvolutionEvidenceRuntimeBrief | null {
  const index = loadLatestEvolutionEvidenceIndex();
  if (!index) {
    return null;
  }

  const maxItems = Math.min(Math.max(args.maxItems ?? 4, 1), 6);
  const activeChangeResult = args.activeChangeId
    ? queryEvolutionEvidenceIndex(index, {
        changeIds: [args.activeChangeId],
        maxNodes: Math.max(maxItems, 3),
      })
    : null;
  const bindingConstraintResult = args.bindingConstraint
    ? queryEvolutionEvidenceIndex(index, {
        dimensions: [args.bindingConstraint],
        artifactTypes: [
          "audit_snapshot",
          "audit_outcome",
          "audit_loop",
          "guidance_outcome",
          "guidance_effectiveness",
          "guidance_adaptation",
          "openspec_change",
          "devlog",
          "knowledge_decision",
        ],
        maxNodes: Math.max(maxItems, 3),
      })
    : null;

  const items = dedupeNodes([
    ...(activeChangeResult?.nodes ?? []),
    ...(bindingConstraintResult?.nodes ?? []),
  ])
    .slice(0, maxItems)
    .map(toItem);

  const uncertaintyParts: string[] = [];
  if (args.activeChangeId && (activeChangeResult?.nodes.length ?? 0) === 0) {
    uncertaintyParts.push(`No indexed artifacts matched active change ${args.activeChangeId}.`);
  }
  if (args.bindingConstraint && (bindingConstraintResult?.nodes.length ?? 0) === 0) {
    uncertaintyParts.push(`No indexed artifacts matched binding constraint ${args.bindingConstraint}.`);
  }

  const generatedAtMs = parseIso(index.generatedAt);
  const stale = generatedAtMs !== null
    ? (Date.now() - generatedAtMs) > STALE_AFTER_HOURS * 60 * 60 * 1000
    : true;
  if (stale) {
    uncertaintyParts.push(`The latest persisted evidence index is older than ${STALE_AFTER_HOURS}h.`);
  }

  const anchorText = items.length > 0
    ? items.slice(0, 2).map((item) => `${item.artifactType} ${item.title}`).join("; ")
    : "none";
  const activeChangeCount = activeChangeResult?.nodes.length ?? 0;
  const bindingCount = bindingConstraintResult?.nodes.length ?? 0;

  const summary = items.length > 0
    ? compact(
        `Indexed continuity matched ${activeChangeCount} active-change artifacts and ${bindingCount} binding-constraint artifacts. Recent anchors: ${anchorText}.`,
      )
    : compact(
        `No cited continuity anchors matched the current active-change / binding-constraint slice.`,
      );

  return {
    generatedAt: index.generatedAt,
    sourcePath: LATEST_INDEX_PATH,
    stale,
    activeChangeId: args.activeChangeId,
    bindingConstraint: args.bindingConstraint,
    summary,
    uncertainty: uncertaintyParts.length > 0 ? compact(uncertaintyParts.join(" "), 260) : null,
    items,
  };
}

export function buildEvolutionEvidenceRuntimePromptBlock(brief: EvolutionEvidenceRuntimeBrief): string {
  const anchors = brief.items.length > 0
    ? brief.items.map((item) => `- ${item.artifactType} ${item.title} :: ${compact(item.summary, 160)} [${item.sourcePath}]`)
    : ["- none"];

  return [
    "AIES EVOLUTION EVIDENCE",
    `Execution summary: ${brief.summary}`,
    `Index generated: ${brief.generatedAt}`,
    `Index source: ${brief.sourcePath}`,
    `Index stale: ${brief.stale}`,
    `Active change thread: ${brief.activeChangeId ?? "none"}`,
    `Binding constraint thread: ${brief.bindingConstraint ?? "none"}`,
    `Uncertainty: ${brief.uncertainty ?? "none"}`,
    "Evidence anchors:",
    ...anchors,
    "Redline: use retrieval only as a cited continuity aid. It may compress history for judgment, but it must not override the current audit guidance or auto-select the next change.",
  ].join("\n");
}
