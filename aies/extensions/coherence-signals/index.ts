import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  CoherenceSignal,
  CoherenceSignalCitation,
  CoherenceSignalFamily,
  CoherenceSignalReport,
  CoherenceSignalScope,
} from "../../contracts/coherence-signals.ts";
import {
  COHERENCE_SIGNAL_FAMILIES,
  COHERENCE_SIGNAL_SCOPES,
} from "../../contracts/coherence-signals.ts";
import type { IsoTimestamp } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";

const COHERENCE_SIGNAL_FILE_NAME = "latest.json";
const MAX_SUMMARY_LENGTH = 220;
const RECENT_DEVLOG_LIMIT = 12;
const EVALUATION_HARNESS_MARKERS = [
  "audit",
  "guidance",
  "evidence",
  "cycle-runner",
  "binding constraint",
  "evolution-evidence",
  "audit-radar",
] as const;

type MarkdownRecord = {
  frontmatter: Record<string, string | string[]>;
  body: string;
};

type DevlogEntry = {
  path: string;
  relatedChangeId: string | null;
  focusType: string | null;
  createdAt: string | null;
  summary: string;
  body: string;
};

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

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function listMarkdownFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  return entries.flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
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

function extractFrontmatterValue(frontmatter: Record<string, string | string[]>, key: string): string | null {
  const value = frontmatter[key];
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractSection(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading.trim());
  if (startIndex === -1) {
    return null;
  }

  const collected: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    collected.push(line);
  }

  const section = collected.join("\n").trim();
  return section.length > 0 ? section : null;
}

function firstParagraph(body: string): string {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .filter((line) => !line.startsWith("- "))
      .join(" "))
    .map((item) => item.trim())
    .filter(Boolean);

  return compact(paragraphs[0] ?? "none");
}

function loadRecentDevlogs(): DevlogEntry[] {
  const paths = listMarkdownFiles(getAiesPaths().devlogRoot)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, RECENT_DEVLOG_LIMIT);

  return paths.map((path) => {
    const record = readMarkdownFile(path);
    const summary = extractSection(record.body, "## Summary") ?? firstParagraph(record.body);
    return {
      path: projectRelativePath(path),
      relatedChangeId: extractFrontmatterValue(record.frontmatter, "related_change_id"),
      focusType: extractFrontmatterValue(record.frontmatter, "focus_type"),
      createdAt: extractFrontmatterValue(record.frontmatter, "created_at"),
      summary: compact(summary, 320),
      body: record.body,
    };
  });
}

function loadText(path: string): string {
  return readFileSync(path, "utf8");
}

function createCitation(sourcePath: string, excerpt: string): CoherenceSignalCitation {
  return {
    sourcePath,
    excerpt: compact(excerpt, 240),
  };
}

function classifyDevlogFamily(devlog: DevlogEntry): "evaluation_harness" | "coherence_theory" | "other" {
  const changeSurface = [devlog.relatedChangeId, devlog.path]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (EVALUATION_HARNESS_MARKERS.some((marker) => changeSurface.includes(marker))) {
    return "evaluation_harness";
  }
  if (["coherence", "theory-question", "theory-question-lab"].some((marker) => changeSurface.includes(marker))) {
    return "coherence_theory";
  }
  return "other";
}

function extractEvaluationHotspotDevlogs(devlogs: DevlogEntry[]): DevlogEntry[] {
  return devlogs.filter((devlog) => classifyDevlogFamily(devlog) === "evaluation_harness");
}

function extractYamlExcerpt(text: string, key: string): string {
  const line = text.split(/\r?\n/).find((entry) => entry.includes(key));
  return compact(line ?? key, 220);
}

function ensureMinimumCitations(citations: CoherenceSignalCitation[], fallback: CoherenceSignalCitation): CoherenceSignalCitation[] {
  return citations.length > 0 ? citations : [fallback];
}

function buildSubsystemHotspotSignal(devlogs: DevlogEntry[]): CoherenceSignal {
  const matched = extractEvaluationHotspotDevlogs(devlogs);
  const citations = matched.slice(0, 3).map((devlog) => createCitation(devlog.path, devlog.summary));

  if (matched.length < 3) {
    return {
      id: "coherence-signal:subsystem-hotspot-concentration",
      title: "Recent hotspot concentration is still too thin to classify",
      status: "insufficient_evidence",
      scope: null,
      signalFamily: "subsystem_hotspot_concentration",
      summary: compact("The recent durable corpus hints at an evaluation/harness hotspot, but fewer than three recent devlogs cite that cluster directly."),
      whyItMatters: compact("Hotspot claims should stay honest. One or two adjacent changes are not enough to call a subsystem locally incoherent."),
      citations: ensureMinimumCitations(citations, createCitation("memory/knowledge/coherence-signals/README.md", "Local hotspot claims should rely on multiple citations from the implicated subsystem.")),
      missingEvidence: [
        "At least three recent durable artifacts describing the same subsystem hotspot.",
        "A stronger thread showing the concentration is more than normal local iteration.",
      ],
      suggestedPaths: [
        "memory/devlog",
        "openspec/changes",
        "aies/extensions/evaluation",
        "aies/extensions/verification",
      ],
    };
  }

  return {
    id: "coherence-signal:subsystem-hotspot-concentration",
    title: "Capability work is currently concentrated in the evaluation/harness hotspot",
    status: "observed",
    scope: "local",
    signalFamily: "subsystem_hotspot_concentration",
    summary: compact(`Recent durable devlogs repeatedly cluster around audit, guidance, evidence, and cycle-runner work (${matched.length} of the last ${devlogs.length} devlogs).`),
    whyItMatters: compact("This looks like a local coherence signal rather than system-wide drift: the activity is concentrated in one subsystem family, so the next question is whether the hotspot is healthy iteration or an unresolved local contradiction."),
    citations,
    missingEvidence: [
      "Operator-visible usage evidence showing whether this hotspot resolved a real bottleneck or merely attracted repeated attention.",
    ],
    suggestedPaths: [
      "aies/extensions/evaluation",
      "aies/extensions/verification",
      "aies/extensions/cycle-runner",
      "operator-ui/server",
      "memory/devlog",
    ],
  };
}

function buildIntentActionMisalignmentSignal(devlogs: DevlogEntry[]): CoherenceSignal {
  const intentText = loadText(join(getAiesPaths().knowledgeRoot, "intent-hierarchy.yaml"));
  const charterText = loadText(join(getAiesPaths().knowledgeRoot, "coherence-charter.yaml"));
  const matched = extractEvaluationHotspotDevlogs(devlogs);

  return {
    id: "coherence-signal:intent-action-misalignment",
    title: "Rotation commitments and recent hotspot work remain in tension",
    status: "observed",
    scope: "ambiguous",
    signalFamily: "intent_action_misalignment",
    summary: compact("The intent hierarchy asks AIES to avoid jagged over-investment in one dimension, yet most recent durable work still lands in evaluation/harness changes. The corpus also records deliberate reasons for that concentration, so the tension is real but not yet classifiable as global incoherence."),
    whyItMatters: compact("This ambiguity is useful: future cycles should not treat every repeated hotspot as failure, but they also should not ignore when the same area keeps winning against rotation goals."),
    citations: [
      createCitation("memory/knowledge/intent-hierarchy.yaml", extractYamlExcerpt(intentText, "name: Balanced evolution")),
      createCitation("memory/knowledge/coherence-charter.yaml", extractYamlExcerpt(charterText, "Multiple consecutive cycles of small maintenance without proposing or advancing a larger capability plan.")),
      ...matched.slice(0, 2).map((devlog) => createCitation(devlog.path, devlog.summary)),
    ],
    missingEvidence: [
      "Need more post-hotspot cycles to tell whether the concentration persists after the new coherence direction was proposed.",
      "Need evidence from at least one other subsystem showing whether the tension is local or whole-harness.",
    ],
    suggestedPaths: [
      "memory/knowledge/intent-hierarchy.yaml",
      "memory/knowledge/coherence-charter.yaml",
      "memory/devlog",
      "openspec/changes",
      "memory/knowledge/coherence-signals",
    ],
  };
}

function buildTheoryRuntimeMismatchSignal(): CoherenceSignal {
  const charterText = loadText(join(getAiesPaths().knowledgeRoot, "coherence-charter.yaml"));
  const theoryText = loadText(join(getAiesPaths().theoryForkRoot, "layers", "coherence.md"));
  const changeText = loadText(join(getAiesPaths().openSpecChangesRoot, "CHG-2026-03-16-coherence-local-global-signals.md"));

  return {
    id: "coherence-signal:theory-runtime-mismatch",
    title: "Possible theory/runtime lag is visible, but not yet classifiable",
    status: "insufficient_evidence",
    scope: null,
    signalFamily: "theory_runtime_mismatch",
    summary: compact("The corpus now contains a sharper coherence taxonomy and an implementation change proposal, but there is not yet enough runtime history to say whether any resulting theory/runtime lag is local, global, or simply normal experiment lead time."),
    whyItMatters: compact("AIES should be able to say 'not enough evidence' when theory gets ahead of implementation. That keeps coherence reporting from turning thin timing gaps into exaggerated drift claims."),
    citations: [
      createCitation("memory/knowledge/coherence-charter.yaml", extractYamlExcerpt(charterText, "Preserve consistency between theory, operational files, and runtime behavior.")),
      createCitation("memory/theory-fork/layers/coherence.md", compact(extractSection(theoryText, "## Open Questions") ?? theoryText, 240)),
      createCitation("openspec/changes/CHG-2026-03-16-coherence-local-global-signals.md", compact(extractSection(changeText, "## Summary") ?? changeText, 240)),
    ],
    missingEvidence: [
      "Need repeated post-implementation cycles using the coherence report builder.",
      "Need at least one operator-visible or cycle-usable surface consuming the coherence map.",
      "Need evidence showing whether the taxonomy changes later work selection or remains descriptive only.",
    ],
    suggestedPaths: [
      "memory/theory-fork/layers/coherence.md",
      "openspec/changes/CHG-2026-03-16-coherence-local-global-signals.md",
      "aies/extensions/coherence-signals",
      "operator-ui/server",
    ],
  };
}

function createSignalSummary(signals: CoherenceSignal[]): CoherenceSignalReport["summary"] {
  const scopeCounts = COHERENCE_SIGNAL_SCOPES.reduce<Record<CoherenceSignalScope, number>>((counts, scope) => {
    counts[scope] = 0;
    return counts;
  }, {} as Record<CoherenceSignalScope, number>);

  const familyCounts = COHERENCE_SIGNAL_FAMILIES.reduce<Record<CoherenceSignalFamily, number>>((counts, family) => {
    counts[family] = 0;
    return counts;
  }, {} as Record<CoherenceSignalFamily, number>);

  for (const signal of signals) {
    familyCounts[signal.signalFamily] += 1;
    if (signal.scope) {
      scopeCounts[signal.scope] += 1;
    }
  }

  return {
    signalCount: signals.length,
    observedCount: signals.filter((signal) => signal.status === "observed").length,
    insufficientEvidenceCount: signals.filter((signal) => signal.status === "insufficient_evidence").length,
    scopeCounts,
    familyCounts,
  };
}

export function createCoherenceSignalReport(): CoherenceSignalReport {
  const paths = getAiesPaths();
  const recentDevlogs = loadRecentDevlogs();
  const signals = [
    buildSubsystemHotspotSignal(recentDevlogs),
    buildIntentActionMisalignmentSignal(recentDevlogs),
    buildTheoryRuntimeMismatchSignal(),
  ];

  return {
    generatedAt: nowIso(),
    advisoryOnly: true,
    sourceRoots: unique([
      projectRelativePath(paths.devlogRoot),
      projectRelativePath(paths.knowledgeRoot),
      projectRelativePath(paths.theoryForkRoot),
      projectRelativePath(paths.openSpecChangesRoot),
    ]),
    summary: createSignalSummary(signals),
    signals,
  };
}

export function persistCoherenceSignalReport(report: CoherenceSignalReport): string {
  const outputRoot = join(getAiesPaths().knowledgeRoot, "coherence-signals");
  mkdirSync(outputRoot, { recursive: true });
  const outputPath = join(outputRoot, COHERENCE_SIGNAL_FILE_NAME);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

export function loadLatestCoherenceSignalReport(): CoherenceSignalReport | null {
  const filePath = join(getAiesPaths().knowledgeRoot, "coherence-signals", COHERENCE_SIGNAL_FILE_NAME);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as CoherenceSignalReport;
}
