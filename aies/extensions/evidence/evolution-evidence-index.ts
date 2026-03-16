import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  AIES_DIMENSIONS,
  type AiesDimension,
  type IsoTimestamp,
} from "../../contracts/primitives.ts";
import type {
  EvolutionEvidenceArtifactType,
  EvolutionEvidenceCitation,
  EvolutionEvidenceConfidence,
  EvolutionEvidenceIndex,
  EvolutionEvidenceNode,
  EvolutionEvidenceQuery,
  EvolutionEvidenceQueryResult,
  EvolutionEvidenceRelation,
  EvolutionEvidenceRelationType,
} from "../../contracts/evolution-evidence-index.ts";
import { getAiesPaths } from "../shared/paths.ts";

type MarkdownRecord = {
  frontmatter: Record<string, string | string[]>;
  body: string;
};

type NodeSeed = Omit<EvolutionEvidenceNode, "dimensionHints" | "citations"> & {
  dimensionHints?: AiesDimension[];
  citations?: EvolutionEvidenceCitation[];
};

type RelationSeed = Omit<EvolutionEvidenceRelation, "id">;

type MutableBuildState = {
  nodes: Map<string, EvolutionEvidenceNode>;
  relations: Map<string, EvolutionEvidenceRelation>;
  changeNodeIds: Map<string, string>;
  snapshotNodeIds: Map<string, string>;
  pathNodeIds: Map<string, string>;
};

const MAX_SUMMARY_LENGTH = 220;
const EVIDENCE_INDEX_FILE_NAME = "latest.json";

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function compact(text: string | null | undefined, maxLength = MAX_SUMMARY_LENGTH): string {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "none";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function listFiles(root: string, predicate: (name: string) => boolean): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root)
    .filter(predicate)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => join(root, name));
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function extractFrontmatterValue(frontmatter: Record<string, string | string[]>, key: string): string | null {
  const value = frontmatter[key];
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractFrontmatterList(frontmatter: Record<string, string | string[]>, key: string): string[] {
  const value = frontmatter[key];
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseMarkdownRecord(content: string): MarkdownRecord {
  if (!content.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: content,
    };
  }

  const closingIndex = content.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return {
      frontmatter: {},
      body: content,
    };
  }

  const frontmatterBlock = content.slice(4, closingIndex);
  const body = content.slice(closingIndex + 5);
  const lines = frontmatterBlock.split(/\r?\n/);
  const frontmatter: Record<string, string | string[]> = {};
  let currentListKey: string | null = null;

  for (const line of lines) {
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentListKey) {
      const currentValue = frontmatter[currentListKey];
      const values = Array.isArray(currentValue) ? currentValue : currentValue ? [currentValue] : [];
      values.push(listMatch[1].trim().replace(/^"|"$/g, ""));
      frontmatter[currentListKey] = values;
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentListKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    const value = rawValue.trim();
    if (!value) {
      frontmatter[key] = [];
      currentListKey = key;
      continue;
    }

    frontmatter[key] = value.replace(/^"|"$/g, "");
    currentListKey = null;
  }

  return {
    frontmatter,
    body,
  };
}

function readMarkdownFile(path: string): MarkdownRecord {
  return parseMarkdownRecord(readFileSync(path, "utf8"));
}

function firstHeading(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? compact(match[1]) : null;
}

function firstParagraph(body: string): string {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith("#") && !item.startsWith("- "));

  return compact(paragraphs[0] ?? "none");
}

function inferDimensions(...texts: Array<string | null | undefined>): AiesDimension[] {
  const combined = texts.map((item) => String(item ?? "").toLowerCase()).join("\n");
  return AIES_DIMENSIONS.filter((dimension) => combined.includes(dimension));
}

function createCitation(sourcePath: string, excerpt: string): EvolutionEvidenceCitation {
  return {
    sourcePath,
    excerpt: compact(excerpt, 180),
  };
}

function createNode(seed: NodeSeed): EvolutionEvidenceNode {
  return {
    ...seed,
    dimensionHints: [...new Set(seed.dimensionHints ?? [])],
    citations: seed.citations ?? [],
  };
}

function relationId(type: EvolutionEvidenceRelationType, fromId: string, toId: string): string {
  return `${type}:${fromId}->${toId}`;
}

function createRelation(seed: RelationSeed): EvolutionEvidenceRelation {
  return {
    ...seed,
    id: relationId(seed.type, seed.fromId, seed.toId),
  };
}

function createBuildState(): MutableBuildState {
  return {
    nodes: new Map<string, EvolutionEvidenceNode>(),
    relations: new Map<string, EvolutionEvidenceRelation>(),
    changeNodeIds: new Map<string, string>(),
    snapshotNodeIds: new Map<string, string>(),
    pathNodeIds: new Map<string, string>(),
  };
}

function addNode(state: MutableBuildState, node: EvolutionEvidenceNode): void {
  state.nodes.set(node.id, node);
}

function addRelation(state: MutableBuildState, relation: EvolutionEvidenceRelation): void {
  state.relations.set(relation.id, relation);
}

function ensureDimensionAnchors(state: MutableBuildState): void {
  for (const dimension of AIES_DIMENSIONS) {
    addNode(state, createNode({
      id: `dimension:${dimension}`,
      artifactType: "dimension_anchor",
      title: `Dimension anchor: ${dimension}`,
      summary: `Synthetic anchor for the ${dimension} layer so indexed relations can point to an explicit target.`,
      createdAt: null,
      sourcePath: "memory/theory-fork/index.md",
      changeId: null,
      tags: ["dimension", dimension],
      metadata: {
        dimension,
      },
      citations: [createCitation("memory/theory-fork/index.md", `The AIES theory tracks the ${dimension} layer explicitly.`)],
    }));
  }
}

function ensurePathAnchor(state: MutableBuildState, pathValue: string, citation: EvolutionEvidenceCitation): string {
  const normalizedPath = pathValue.trim().replace(/\\/g, "/");
  const existing = state.pathNodeIds.get(normalizedPath);
  if (existing) {
    return existing;
  }

  const nodeId = `path:${normalizedPath}`;
  state.pathNodeIds.set(normalizedPath, nodeId);
  addNode(state, createNode({
    id: nodeId,
    artifactType: "path_anchor",
    title: normalizedPath,
    summary: `Synthetic anchor for the repo path ${normalizedPath}.`,
    createdAt: null,
    sourcePath: normalizedPath,
    changeId: null,
    tags: ["path"],
    metadata: {
      path: normalizedPath,
    },
    citations: [citation],
  }));
  return nodeId;
}

function connectToDimensions(
  state: MutableBuildState,
  fromId: string,
  dimensions: AiesDimension[],
  rationale: string,
  citation: EvolutionEvidenceCitation,
  confidence: EvolutionEvidenceConfidence = "direct",
): void {
  for (const dimension of [...new Set(dimensions)]) {
    addRelation(state, createRelation({
      type: "targets_dimension",
      fromId,
      toId: `dimension:${dimension}`,
      confidence,
      rationale,
      citations: [citation],
    }));
  }
}

function connectToChange(
  state: MutableBuildState,
  fromId: string,
  changeId: string | null,
  rationale: string,
  citation: EvolutionEvidenceCitation,
): void {
  if (!changeId) {
    return;
  }

  const changeNodeId = state.changeNodeIds.get(changeId);
  if (!changeNodeId) {
    return;
  }

  addRelation(state, createRelation({
    type: "continues_change",
    fromId,
    toId: changeNodeId,
    confidence: "direct",
    rationale,
    citations: [citation],
  }));
}

function connectToSnapshot(
  state: MutableBuildState,
  fromId: string,
  snapshotId: string | null,
  rationale: string,
  citation: EvolutionEvidenceCitation,
): void {
  if (!snapshotId) {
    return;
  }

  const snapshotNodeId = state.snapshotNodeIds.get(snapshotId);
  if (!snapshotNodeId) {
    return;
  }

  addRelation(state, createRelation({
    type: "references_snapshot",
    fromId,
    toId: snapshotNodeId,
    confidence: "direct",
    rationale,
    citations: [citation],
  }));
}

function parseSuggestedPaths(body: string): string[] {
  const match = body.match(/Suggested paths:\s*([^\n]+)/i);
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function taskCounts(body: string): { complete: number; incomplete: number } {
  return {
    complete: (body.match(/- \[x\]/g) ?? []).length,
    incomplete: (body.match(/- \[ \]/g) ?? []).length,
  };
}

function ingestOpenSpecChanges(state: MutableBuildState): void {
  const root = getAiesPaths().openSpecChangesRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".md") && name.startsWith("CHG-"))) {
    const relativePath = projectRelativePath(filePath);
    const record = readMarkdownFile(filePath);
    const changeId = extractFrontmatterValue(record.frontmatter, "change_id") ?? basename(filePath, ".md");
    const title = extractFrontmatterValue(record.frontmatter, "title") ?? changeId;
    const generatedFromDimension = extractFrontmatterValue(record.frontmatter, "generated_from_dimension") as AiesDimension | null;
    const suggestedPaths = parseSuggestedPaths(record.body);
    const counts = taskCounts(record.body);
    const citation = createCitation(relativePath, record.body.split(/\r?\n/).find((line) => line.trim()) ?? title);
    const nodeId = `change:${changeId}`;

    const node = createNode({
      id: nodeId,
      artifactType: "openspec_change",
      title,
      summary: firstParagraph(record.body),
      createdAt: null,
      sourcePath: relativePath,
      changeId,
      dimensionHints: [...new Set([...(generatedFromDimension ? [generatedFromDimension] : []), ...inferDimensions(title, record.body)])],
      tags: ["openspec", "change"],
      metadata: {
        generatedFromDimension,
        suggestedPaths,
        completeTasks: counts.complete,
        incompleteTasks: counts.incomplete,
      },
      citations: [citation],
    });

    addNode(state, node);
    state.changeNodeIds.set(changeId, nodeId);

    if (generatedFromDimension) {
      connectToDimensions(state, nodeId, [generatedFromDimension], "The change was generated from this binding constraint dimension.", citation);
    }

    for (const suggestedPath of suggestedPaths) {
      const pathNodeId = ensurePathAnchor(state, suggestedPath, citation);
      addRelation(state, createRelation({
        type: "touches_path",
        fromId: nodeId,
        toId: pathNodeId,
        confidence: "direct",
        rationale: "The OpenSpec proposal names this path as a suggested implementation surface.",
        citations: [citation],
      }));
    }
  }
}

function ingestMarkdownMemory(state: MutableBuildState): void {
  const paths = getAiesPaths();

  for (const filePath of listFiles(paths.devlogRoot, (name) => name.endsWith(".md"))) {
    const relativePath = projectRelativePath(filePath);
    const record = readMarkdownFile(filePath);
    const title = extractFrontmatterValue(record.frontmatter, "title") ?? firstHeading(record.body) ?? basename(filePath, ".md");
    const changeId = extractFrontmatterValue(record.frontmatter, "related_change_id");
    const tags = extractFrontmatterList(record.frontmatter, "tags");
    const citation = createCitation(relativePath, firstParagraph(record.body));
    const node = createNode({
      id: `devlog:${basename(filePath, ".md")}`,
      artifactType: "devlog",
      title,
      summary: firstParagraph(record.body),
      createdAt: extractFrontmatterValue(record.frontmatter, "created_at"),
      sourcePath: relativePath,
      changeId,
      dimensionHints: inferDimensions(title, record.body, tags.join(" "), extractFrontmatterValue(record.frontmatter, "focus_type")),
      tags,
      metadata: {
        focusType: extractFrontmatterValue(record.frontmatter, "focus_type"),
        verificationMode: extractFrontmatterValue(record.frontmatter, "verification_mode"),
        verificationResult: extractFrontmatterValue(record.frontmatter, "verification_result"),
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToChange(state, node.id, changeId, "The devlog explicitly links itself to this OpenSpec change.", citation);
    connectToDimensions(state, node.id, node.dimensionHints, "The devlog text names these AIES dimensions directly.", citation, "heuristic");
  }

  for (const filePath of listFiles(paths.knowledgeRoot, (name) => name.endsWith(".md") && name !== "README.md" && !name.startsWith("CHG-"))) {
    const relativePath = projectRelativePath(filePath);
    if (relativePath.startsWith("memory/knowledge/audit-radar/")) {
      continue;
    }

    const record = readMarkdownFile(filePath);
    const title = extractFrontmatterValue(record.frontmatter, "title") ?? firstHeading(record.body) ?? basename(filePath, ".md");
    const changeId = extractFrontmatterValue(record.frontmatter, "related_change_id");
    const tags = extractFrontmatterList(record.frontmatter, "tags");
    const citation = createCitation(relativePath, firstParagraph(record.body));
    const node = createNode({
      id: `knowledge:${basename(filePath, ".md")}`,
      artifactType: "knowledge_decision",
      title,
      summary: firstParagraph(record.body),
      createdAt: extractFrontmatterValue(record.frontmatter, "created_at"),
      sourcePath: relativePath,
      changeId,
      dimensionHints: inferDimensions(title, record.body, tags.join(" ")),
      tags,
      metadata: {
        kind: extractFrontmatterValue(record.frontmatter, "kind"),
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToChange(state, node.id, changeId, "The durable knowledge note records this OpenSpec thread explicitly.", citation);
    connectToDimensions(state, node.id, node.dimensionHints, "The knowledge note names these AIES dimensions directly.", citation, "heuristic");
  }
}

function ingestTheory(state: MutableBuildState): void {
  const theoryRoots = [
    join(getAiesPaths().theoryForkRoot, "layers"),
    join(getAiesPaths().theoryForkRoot, "meta"),
  ];

  for (const root of theoryRoots) {
    for (const filePath of listFiles(root, (name) => name.endsWith(".md"))) {
      const relativePath = projectRelativePath(filePath);
      const record = readMarkdownFile(filePath);
      const title = firstHeading(record.body) ?? basename(filePath, ".md");
      const citation = createCitation(relativePath, firstParagraph(record.body));
      const node = createNode({
        id: `theory:${relativePath}`,
        artifactType: "theory_note",
        title,
        summary: firstParagraph(record.body),
        createdAt: null,
        sourcePath: relativePath,
        changeId: null,
        dimensionHints: inferDimensions(relativePath, title, record.body),
        tags: ["theory"],
        metadata: {
          area: relativePath.includes("/meta/") ? "meta" : "layer",
        },
        citations: [citation],
      });

      addNode(state, node);
      connectToDimensions(state, node.id, node.dimensionHints, "The theory note explicitly discusses these AIES dimensions.", citation, "heuristic");
    }
  }
}

function ingestAuditSnapshots(state: MutableBuildState): void {
  const root = getAiesPaths().auditRadarSnapshotsRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".json"))) {
    const report = readJsonFile(filePath) as {
      snapshotId?: string;
      observedAt?: string;
      summary?: string;
      bindingConstraint?: { dimension?: AiesDimension };
    };
    const snapshotId = report.snapshotId ?? basename(filePath, ".json");
    const relativePath = projectRelativePath(filePath);
    const citation = createCitation(relativePath, report.summary ?? snapshotId);
    const dimension = report.bindingConstraint?.dimension ?? null;
    const nodeId = `snapshot:${snapshotId}`;
    const node = createNode({
      id: nodeId,
      artifactType: "audit_snapshot",
      title: snapshotId,
      summary: compact(report.summary),
      createdAt: report.observedAt ?? null,
      sourcePath: relativePath,
      changeId: null,
      dimensionHints: dimension ? [dimension] : [],
      tags: ["audit-radar", "snapshot"],
      metadata: {
        bindingConstraint: dimension,
      },
      citations: [citation],
    });

    addNode(state, node);
    state.snapshotNodeIds.set(snapshotId, nodeId);
    if (dimension) {
      connectToDimensions(state, nodeId, [dimension], "The audit snapshot identifies this dimension as the current binding constraint.", citation);
    }
  }
}

function ingestAuditOutcomes(state: MutableBuildState): void {
  const root = getAiesPaths().auditRadarOutcomesRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".json"))) {
    const report = readJsonFile(filePath) as {
      reportId?: string;
      generatedAt?: string;
      summary?: string;
      comparisons?: Array<{
        previousSnapshotId?: string;
        currentSnapshotId?: string;
        comparedWeakDimensions?: AiesDimension[];
        improvedDimensions?: AiesDimension[];
        stagnantWeakDimensions?: AiesDimension[];
      }>;
    };
    const reportId = report.reportId ?? basename(filePath, ".json");
    const relativePath = projectRelativePath(filePath);
    const citation = createCitation(relativePath, report.summary ?? reportId);
    const dimensions = new Set<AiesDimension>();
    for (const comparison of report.comparisons ?? []) {
      for (const dimension of comparison.comparedWeakDimensions ?? []) dimensions.add(dimension);
      for (const dimension of comparison.improvedDimensions ?? []) dimensions.add(dimension);
      for (const dimension of comparison.stagnantWeakDimensions ?? []) dimensions.add(dimension);
    }

    const node = createNode({
      id: `outcome:${reportId}`,
      artifactType: "audit_outcome",
      title: reportId,
      summary: compact(report.summary),
      createdAt: report.generatedAt ?? null,
      sourcePath: relativePath,
      changeId: null,
      dimensionHints: [...dimensions],
      tags: ["audit-radar", "outcome"],
      metadata: {
        comparisonCount: report.comparisons?.length ?? 0,
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToDimensions(state, node.id, node.dimensionHints, "The outcome report compares these weak or changed dimensions across audits.", citation, "heuristic");

    for (const comparison of report.comparisons ?? []) {
      connectToSnapshot(state, node.id, comparison.previousSnapshotId ?? null, "The outcome report compares against this earlier audit snapshot.", citation);
      connectToSnapshot(state, node.id, comparison.currentSnapshotId ?? null, "The outcome report compares against this later audit snapshot.", citation);
    }
  }
}

function ingestAuditLoops(state: MutableBuildState): void {
  const root = getAiesPaths().auditRadarLoopsRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".json"))) {
    const report = readJsonFile(filePath) as {
      loopId?: string;
      generatedAt?: string;
      relatedChangeId?: string | null;
      snapshotId?: string | null;
      outcomeReportId?: string | null;
      summary?: string;
      verification?: { executedCommand?: string | null };
      verificationScope?: { introducedFiles?: Array<{ path?: string | null }> };
    };
    const loopId = report.loopId ?? basename(filePath, ".json");
    const relativePath = projectRelativePath(filePath);
    const citation = createCitation(relativePath, report.summary ?? loopId);
    const node = createNode({
      id: `loop:${loopId}`,
      artifactType: "audit_loop",
      title: loopId,
      summary: compact(report.summary),
      createdAt: report.generatedAt ?? null,
      sourcePath: relativePath,
      changeId: report.relatedChangeId ?? null,
      dimensionHints: inferDimensions(report.summary, report.relatedChangeId),
      tags: ["audit-radar", "loop"],
      metadata: {
        outcomeReportId: report.outcomeReportId ?? null,
        executedCommand: report.verification?.executedCommand ?? null,
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToChange(state, node.id, report.relatedChangeId ?? null, "The audit loop records the OpenSpec change tied to the run.", citation);
    connectToSnapshot(state, node.id, report.snapshotId ?? null, "The loop report points to the audit snapshot generated for the run.", citation);

    const executedCommand = report.verification?.executedCommand?.trim();
    if (executedCommand) {
      const commandNodeId = ensurePathAnchor(state, executedCommand, citation);
      addRelation(state, createRelation({
        type: "verifies_surface",
        fromId: node.id,
        toId: commandNodeId,
        confidence: "direct",
        rationale: "The loop report records this verification command as the executed proof surface.",
        citations: [citation],
      }));
    }

    for (const introducedFile of report.verificationScope?.introducedFiles ?? []) {
      const changedPath = introducedFile.path?.trim();
      if (!changedPath) {
        continue;
      }
      const pathNodeId = ensurePathAnchor(state, changedPath, citation);
      addRelation(state, createRelation({
        type: "touches_path",
        fromId: node.id,
        toId: pathNodeId,
        confidence: "direct",
        rationale: "The loop report lists this file in the observed change surface for the run.",
        citations: [citation],
      }));
    }
  }
}

function ingestGuidanceOutcomes(state: MutableBuildState): void {
  const root = getAiesPaths().auditRadarGuidanceOutcomesRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".json"))) {
    const report = readJsonFile(filePath) as {
      reportId?: string;
      generatedAt?: string;
      relatedChangeId?: string | null;
      guidance?: {
        snapshotId?: string | null;
        bindingConstraint?: AiesDimension;
        targetDimensions?: AiesDimension[];
        summary?: string;
      };
      alignment?: { summary?: string };
    };
    const reportId = report.reportId ?? basename(filePath, ".json");
    const relativePath = projectRelativePath(filePath);
    const citation = createCitation(relativePath, report.alignment?.summary ?? report.guidance?.summary ?? reportId);
    const dimensions = [...new Set([report.guidance?.bindingConstraint, ...(report.guidance?.targetDimensions ?? [])].filter(Boolean))] as AiesDimension[];
    const node = createNode({
      id: `guidance-outcome:${reportId}`,
      artifactType: "guidance_outcome",
      title: reportId,
      summary: compact(report.alignment?.summary ?? report.guidance?.summary),
      createdAt: report.generatedAt ?? null,
      sourcePath: relativePath,
      changeId: report.relatedChangeId ?? null,
      dimensionHints: dimensions,
      tags: ["audit-radar", "guidance-outcome"],
      metadata: {
        snapshotId: report.guidance?.snapshotId ?? null,
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToChange(state, node.id, report.relatedChangeId ?? null, "The guidance-outcome report records which OpenSpec change the guided cycle continued.", citation);
    connectToSnapshot(state, node.id, report.guidance?.snapshotId ?? null, "The guidance-outcome report cites the audit snapshot that produced the guidance brief.", citation);
    connectToDimensions(state, node.id, dimensions, "The guidance brief names these tracked target dimensions.", citation);
  }
}

function ingestGuidanceEffectiveness(state: MutableBuildState): void {
  const root = getAiesPaths().auditRadarGuidanceEffectivenessRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".json"))) {
    const report = readJsonFile(filePath) as {
      reportId?: string;
      generatedAt?: string;
      summary?: string;
      items?: Array<{
        relatedChangeId?: string | null;
        guidanceSnapshotId?: string | null;
        trackedDimensions?: AiesDimension[];
        linkedPostRunAudit?: { snapshotId?: string | null };
      }>;
    };
    const reportId = report.reportId ?? basename(filePath, ".json");
    const relativePath = projectRelativePath(filePath);
    const citation = createCitation(relativePath, report.summary ?? reportId);
    const dimensions = new Set<AiesDimension>();
    const changeIds = new Set<string>();
    for (const item of report.items ?? []) {
      for (const dimension of item.trackedDimensions ?? []) dimensions.add(dimension);
      if (item.relatedChangeId) changeIds.add(item.relatedChangeId);
    }

    const node = createNode({
      id: `guidance-effectiveness:${reportId}`,
      artifactType: "guidance_effectiveness",
      title: reportId,
      summary: compact(report.summary),
      createdAt: report.generatedAt ?? null,
      sourcePath: relativePath,
      changeId: [...changeIds][0] ?? null,
      dimensionHints: [...dimensions],
      tags: ["audit-radar", "guidance-effectiveness"],
      metadata: {
        itemCount: report.items?.length ?? 0,
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToDimensions(state, node.id, node.dimensionHints, "The guidance-effectiveness report tracks these dimensions across aligned or divergent guided runs.", citation);
    for (const changeId of changeIds) {
      connectToChange(state, node.id, changeId, "The effectiveness report aggregates evidence for this related OpenSpec change.", citation);
    }
    for (const item of report.items ?? []) {
      connectToSnapshot(state, node.id, item.guidanceSnapshotId ?? null, "The effectiveness report references the snapshot that generated the guidance being evaluated.", citation);
      connectToSnapshot(state, node.id, item.linkedPostRunAudit?.snapshotId ?? null, "The effectiveness report links to the post-run audit snapshot used for outcome comparison.", citation);
    }
  }
}

function ingestGuidanceAdaptation(state: MutableBuildState): void {
  const root = getAiesPaths().auditRadarGuidanceAdaptationRoot;
  for (const filePath of listFiles(root, (name) => name.endsWith(".json"))) {
    const report = readJsonFile(filePath) as {
      reportId?: string;
      generatedAt?: string;
      status?: string;
      summary?: string;
      latestContext?: {
        snapshotId?: string | null;
        bindingConstraint?: AiesDimension | null;
      };
    };
    const reportId = report.reportId ?? basename(filePath, ".json");
    const relativePath = projectRelativePath(filePath);
    const citation = createCitation(relativePath, report.summary ?? reportId);
    const dimensions = report.latestContext?.bindingConstraint ? [report.latestContext.bindingConstraint] : [];
    const node = createNode({
      id: `guidance-adaptation:${reportId}`,
      artifactType: "guidance_adaptation",
      title: reportId,
      summary: compact(report.summary),
      createdAt: report.generatedAt ?? null,
      sourcePath: relativePath,
      changeId: null,
      dimensionHints: dimensions,
      tags: ["audit-radar", "guidance-adaptation", report.status ?? "unknown"],
      metadata: {
        status: report.status ?? "unknown",
        snapshotId: report.latestContext?.snapshotId ?? null,
      },
      citations: [citation],
    });

    addNode(state, node);
    connectToSnapshot(state, node.id, report.latestContext?.snapshotId ?? null, "The adaptation report annotates the current guidance generated from this audit snapshot.", citation);
    connectToDimensions(state, node.id, dimensions, "The adaptation report annotates trust for the current binding constraint dimension.", citation);
  }
}

function buildSummary(nodes: EvolutionEvidenceNode[], relations: EvolutionEvidenceRelation[]): EvolutionEvidenceIndex["summary"] {
  const artifactTypes: EvolutionEvidenceArtifactType[] = [
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

  const artifactCounts = Object.fromEntries(artifactTypes.map((type) => [type, 0])) as Record<EvolutionEvidenceArtifactType, number>;
  for (const node of nodes) {
    artifactCounts[node.artifactType] += 1;
  }

  return {
    nodeCount: nodes.length,
    relationCount: relations.length,
    artifactCounts,
  };
}

export function createEvolutionEvidenceIndex(): EvolutionEvidenceIndex {
  const state = createBuildState();
  ensureDimensionAnchors(state);
  ingestOpenSpecChanges(state);
  ingestMarkdownMemory(state);
  ingestTheory(state);
  ingestAuditSnapshots(state);
  ingestAuditOutcomes(state);
  ingestAuditLoops(state);
  ingestGuidanceOutcomes(state);
  ingestGuidanceEffectiveness(state);
  ingestGuidanceAdaptation(state);

  const nodes = [...state.nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  const relations = [...state.relations.values()].sort((left, right) => left.id.localeCompare(right.id));

  return {
    generatedAt: nowIso(),
    advisoryOnly: true,
    sourceRoots: [
      "openspec/changes",
      "memory/devlog",
      "memory/knowledge",
      "memory/theory-fork",
      "memory/knowledge/audit-radar",
    ],
    summary: buildSummary(nodes, relations),
    nodes,
    relations,
  };
}

export function ensureEvolutionEvidenceIndexDirectory(): string {
  const directory = getAiesPaths().evolutionEvidenceIndexRoot;
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function persistEvolutionEvidenceIndex(index: EvolutionEvidenceIndex): string {
  const directory = ensureEvolutionEvidenceIndexDirectory();
  const stampedFileName = `${index.generatedAt.replace(/[:.]/g, "-")}--evolution-evidence-index.json`;
  const stampedPath = join(directory, stampedFileName);
  const latestPath = join(directory, EVIDENCE_INDEX_FILE_NAME);
  const serialized = JSON.stringify(index, null, 2);

  writeFileSync(stampedPath, serialized, "utf8");
  writeFileSync(latestPath, serialized, "utf8");

  return projectRelativePath(stampedPath);
}

export function loadLatestEvolutionEvidenceIndex(): EvolutionEvidenceIndex | null {
  const filePath = join(getAiesPaths().evolutionEvidenceIndexRoot, EVIDENCE_INDEX_FILE_NAME);
  if (!existsSync(filePath)) {
    return null;
  }

  return readJsonFile(filePath) as EvolutionEvidenceIndex;
}

function nodeMatchesDimensions(node: EvolutionEvidenceNode, dimensions: AiesDimension[]): boolean {
  return dimensions.length === 0 || dimensions.some((dimension) => node.dimensionHints.includes(dimension));
}

function nodeMatchesChangeIds(index: EvolutionEvidenceIndex, node: EvolutionEvidenceNode, changeIds: string[]): boolean {
  if (changeIds.length === 0) {
    return true;
  }

  if (node.changeId && changeIds.includes(node.changeId)) {
    return true;
  }

  if (node.artifactType === "openspec_change") {
    return changeIds.includes(node.changeId ?? node.title);
  }

  return index.relations.some((relation) => relation.type === "continues_change"
    && relation.fromId === node.id
    && changeIds.includes(index.nodes.find((candidate) => candidate.id === relation.toId)?.changeId ?? ""));
}

export function queryEvolutionEvidenceIndex(index: EvolutionEvidenceIndex, query: EvolutionEvidenceQuery): EvolutionEvidenceQueryResult {
  const dimensions = query.dimensions ?? [];
  const changeIds = query.changeIds ?? [];
  const artifactTypes = query.artifactTypes ?? [];
  const loweredText = query.text?.trim().toLowerCase() ?? "";
  const maxNodes = query.maxNodes ?? 12;

  const nodes = index.nodes
    .filter((node) => artifactTypes.length === 0 || artifactTypes.includes(node.artifactType))
    .filter((node) => nodeMatchesDimensions(node, dimensions))
    .filter((node) => nodeMatchesChangeIds(index, node, changeIds))
    .filter((node) => !loweredText || `${node.title}\n${node.summary}\n${node.sourcePath}`.toLowerCase().includes(loweredText))
    .slice(0, maxNodes);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const relations = index.relations.filter((relation) => nodeIds.has(relation.fromId) || nodeIds.has(relation.toId));

  return {
    query,
    nodes,
    relations,
  };
}

export function formatEvolutionEvidenceIndex(index: EvolutionEvidenceIndex): string {
  return [
    `Evolution evidence index @ ${index.generatedAt}`,
    `Advisory only: ${index.advisoryOnly}`,
    `Nodes: ${index.summary.nodeCount}`,
    `Relations: ${index.summary.relationCount}`,
    `Artifacts: ${Object.entries(index.summary.artifactCounts).filter(([, count]) => count > 0).map(([type, count]) => `${type}=${count}`).join(", ")}`,
  ].join("\n");
}

export function formatEvolutionEvidenceQueryResult(result: EvolutionEvidenceQueryResult): string {
  const lines = [
    `Evidence query matched ${result.nodes.length} nodes and ${result.relations.length} relations.`,
  ];

  for (const node of result.nodes) {
    lines.push(`- ${node.artifactType}: ${node.title} (${node.sourcePath})`);
  }

  return lines.join("\n");
}
