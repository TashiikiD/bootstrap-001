import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { AuditEvidenceItem } from "../../contracts/layer-audit-snapshot.ts";
import { AIES_DIMENSIONS, type AiesDimension } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";

export interface AuditEvidenceScanResult {
  observedAt: string;
  auditProtocolVersion: string;
  scannedRoots: string[];
  evidence: AuditEvidenceItem[];
  missingDimensions: AiesDimension[];
}

type FileRule = {
  kind: "file";
  ruleId: string;
  dimension: AiesDimension;
  relativePath: string;
  summary: string;
  extractExcerpt: (content: string) => string | null;
};

type DirectoryRule = {
  kind: "directory";
  ruleId: string;
  dimension: AiesDimension;
  relativePath: string;
  summary: string;
  extractExcerpt: (entries: string[]) => string | null;
};

type EvidenceRule = FileRule | DirectoryRule;

const AUDIT_PROTOCOL_VERSION = "docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md@1.0";
const SCANNED_ROOTS = ["AGENTS.md", "memory/", "openspec/", "aies/extensions/", "operator-ui/", ".pi/"];

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, maxLength = 220): string {
  const compact = normalize(text);
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function projectRelativePath(fullPath: string): string {
  return relative(getAiesPaths().projectRoot, fullPath).replace(/\\/g, "/");
}

function firstMatchingLine(content: string, patterns: Array<string | RegExp>): string | null {
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    for (const pattern of patterns) {
      if (typeof pattern === "string" ? line.includes(pattern) : pattern.test(line)) {
        return shorten(line);
      }
    }
  }

  return null;
}

function markdownSectionExcerpt(content: string, heading: string): string | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)(?=\\n## |$)`, "i"));
  if (!match?.[1]) {
    return null;
  }

  const lines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  return lines.length > 0 ? shorten(lines.join(" ")) : null;
}

function summarizeDirectory(entries: string[], interestingEntries: string[]): string | null {
  const found = interestingEntries.filter((name) => entries.includes(name));
  if (found.length === 0) {
    return null;
  }
  return shorten(`Contains ${found.join(", ")}.`);
}

function latestChangePath(): string | null {
  const paths = getAiesPaths();
  if (!existsSync(paths.openSpecChangesRoot)) {
    return null;
  }

  const fileName = readdirSync(paths.openSpecChangesRoot)
    .filter((name) => /^CHG-.*\.md$/i.test(name))
    .sort()
    .reverse()[0] ?? null;

  return fileName ? join(paths.openSpecChangesRoot, fileName) : null;
}

function buildRules(): EvidenceRule[] {
  const latestChange = latestChangePath();

  return [
    {
      kind: "file",
      ruleId: "prompt-agents-structured-cycle",
      dimension: "prompt",
      relativePath: "AGENTS.md",
      summary: "AGENTS.md provides structured cycle instructions, constraints, and success-shape guidance.",
      extractExcerpt: (content) => firstMatchingLine(content, ["Preferred shape:", "Default style:", "Anti-pattern:"]),
    },
    {
      kind: "file",
      ruleId: "prompt-openspec-skill-decomposition",
      dimension: "prompt",
      relativePath: ".pi/skills/openspec-apply-change/SKILL.md",
      summary: "The OpenSpec apply skill decomposes implementation into explicit steps, pause conditions, and completion reporting.",
      extractExcerpt: (content) => firstMatchingLine(content, ["6. **Implement tasks (loop until done or blocked)**", "- Always read context files before starting", "- Keep code changes minimal and scoped to each task"]),
    },
    {
      kind: "directory",
      ruleId: "context-memory-tree",
      dimension: "context",
      relativePath: "memory",
      summary: "AIES keeps durable cross-session context in dedicated memory roots.",
      extractExcerpt: (entries) => summarizeDirectory(entries, ["knowledge", "theory-fork", "devlog"]),
    },
    {
      kind: "file",
      ruleId: "context-memory-readme",
      dimension: "context",
      relativePath: "memory/README.md",
      summary: "The memory README defines durable human-readable storage for lessons, theory, and devlog continuity.",
      extractExcerpt: (content) => firstMatchingLine(content, ["Durable AIES memory stays here in human-readable form.", "knowledge/", "theory-fork/"]),
    },
    {
      kind: "file",
      ruleId: "intent-north-star",
      dimension: "intent",
      relativePath: "memory/knowledge/intent-hierarchy.yaml",
      summary: "The intent hierarchy encodes the north star, ranked priorities, and tradeoff defaults for self-evolution.",
      extractExcerpt: (content) => firstMatchingLine(content, ["north_star:", "ranked_priorities:", "Prefer ambitious capability expansion over conservative micro-maintenance when both are viable."]),
    },
    ...(latestChange
      ? [{
          kind: "file" as const,
          ruleId: "intent-active-change-direction",
          dimension: "intent",
          relativePath: projectRelativePath(latestChange),
          summary: "The latest OpenSpec change records a multi-step evolution direction rather than ad-hoc work.",
          extractExcerpt: (content: string) => markdownSectionExcerpt(content, "Summary") ?? firstMatchingLine(content, ["title:", "## Summary"]),
        }]
      : []),
    {
      kind: "file",
      ruleId: "judgment-redlines",
      dimension: "judgment",
      relativePath: "AGENTS.md",
      summary: "AGENTS.md defines non-negotiable red lines that constrain autonomous action.",
      extractExcerpt: (content) => markdownSectionExcerpt(content, "Redlines") ?? firstMatchingLine(content, ["Do not invent hidden control state", "Do not mutate unrelated files", "Never use `Remove-Item -Recurse -Force`"]),
    },
    {
      kind: "file",
      ruleId: "judgment-escalation-boundaries",
      dimension: "judgment",
      relativePath: "memory/knowledge/intent-hierarchy.yaml",
      summary: "Autonomy boundaries and escalation triggers make uncertainty handling explicit.",
      extractExcerpt: (content) => firstMatchingLine(content, ["autonomy_boundaries:", "escalation_triggers:", "- Failing tests after self-healing attempts."]),
    },
    {
      kind: "file",
      ruleId: "coherence-charter",
      dimension: "coherence",
      relativePath: "memory/knowledge/coherence-charter.yaml",
      summary: "The coherence charter defines identity commitments, failure signals, and evolution health checks.",
      extractExcerpt: (content) => firstMatchingLine(content, ["identity_commitments:", "coherence_failure_signals:", "evolution_health_signals:"]),
    },
    {
      kind: "file",
      ruleId: "coherence-theory-fork",
      dimension: "coherence",
      relativePath: "memory/theory-fork/index.md",
      summary: "The theory fork preserves an evolving interpretation layer that mediates between stable foundations and runtime behavior.",
      extractExcerpt: (content) => firstMatchingLine(content, ["This theory fork now sits on top of a small foundation stack:", "This creates an intentional split between stable imported references and evolvable operational interpretation."]),
    },
    {
      kind: "file",
      ruleId: "coherence-audit-radar-drift",
      dimension: "coherence",
      relativePath: "aies/extensions/evaluation/audit-radar-drift.ts",
      summary: "The audit radar now compares snapshots over time to detect stagnation, repeated binding constraints, and theory/runtime divergence.",
      extractExcerpt: (content) => firstMatchingLine(content, ["function repeatedBindingConstraintCount(", "maintenanceLoopRisk", "theoryRuntimeDivergence"]),
    },
    {
      kind: "file",
      ruleId: "evaluation-snapshot-logic",
      dimension: "evaluation",
      relativePath: "aies/extensions/evaluation/index.ts",
      summary: "The evaluation extension already creates structured evaluation snapshots with neglected-dimension and drift markers.",
      extractExcerpt: (content) => firstMatchingLine(content, ["function createSnapshot(", "suggestedFocus", "recommendationForFocus"]),
    },
    {
      kind: "file",
      ruleId: "evaluation-verification-recovery",
      dimension: "evaluation",
      relativePath: "aies/extensions/verification/index.ts",
      summary: "The verification extension records verification mode, verification results, and recovery follow-up as explicit evaluation surfaces.",
      extractExcerpt: (content) => firstMatchingLine(content, ["VERIFICATION_MODE_ENTRY_TYPE", "restoreVerificationEntry", "restoreRecoveryEntry"]),
    },
    {
      kind: "file",
      ruleId: "evaluation-audit-radar-persistence",
      dimension: "evaluation",
      relativePath: "aies/extensions/evaluation/audit-radar-state.ts",
      summary: "The audit radar persistence layer stores serialized snapshots in durable memory so later cycles can compare audit state across sessions.",
      extractExcerpt: (content) => firstMatchingLine(content, ["export function loadAuditSnapshotHistory(", "export function persistAuditSnapshot(", "auditRadarSnapshotsRoot"]),
    },
    {
      kind: "file",
      ruleId: "harness-extension-registry",
      dimension: "harness",
      relativePath: ".pi/settings.json",
      summary: "Pi settings wire the project-local extensions, skills, and prompts into the execution harness.",
      extractExcerpt: (content) => firstMatchingLine(content, ["\"extensions\"", "\"skills\"", "\"prompts\""]),
    },
    {
      kind: "file",
      ruleId: "harness-operator-ui-bridge",
      dimension: "harness",
      relativePath: "operator-ui/server/index.ts",
      summary: "The operator UI backend provides the local execution bridge, control surface, and heartbeat orchestration hooks.",
      extractExcerpt: (content) => firstMatchingLine(content, ["const HEARTBEAT_TRIGGER_COMMAND = \"/cycle-run --source operator_ui\";", "function getHeartbeatSnapshot()", "runPiDetached"]),
    },
  ];
}

function scanRule(rule: EvidenceRule, observedAt: string): AuditEvidenceItem | null {
  const paths = getAiesPaths();
  const absolutePath = join(paths.projectRoot, rule.relativePath);
  if (!existsSync(absolutePath)) {
    return null;
  }

  if (rule.kind === "directory") {
    const entries = readdirSync(absolutePath);
    const excerpt = rule.extractExcerpt(entries);
    if (!excerpt) {
      return null;
    }

    return {
      evidenceId: `audit-${rule.ruleId}`,
      dimension: rule.dimension,
      summary: rule.summary,
      sourceType: "directory",
      sourcePath: rule.relativePath,
      excerpt,
      observedAt,
    };
  }

  const content = readFileSync(absolutePath, "utf8");
  const excerpt = rule.extractExcerpt(content);
  if (!excerpt) {
    return null;
  }

  return {
    evidenceId: `audit-${rule.ruleId}`,
    dimension: rule.dimension,
    summary: rule.summary,
    sourceType: "file",
    sourcePath: rule.relativePath,
    excerpt,
    observedAt,
  };
}

export function scanAuditEvidence(): AuditEvidenceScanResult {
  const observedAt = nowIso();
  const evidence = buildRules()
    .map((rule) => scanRule(rule, observedAt))
    .filter((item): item is AuditEvidenceItem => item !== null);

  const dimensionsWithEvidence = new Set(evidence.map((item) => item.dimension));

  return {
    observedAt,
    auditProtocolVersion: AUDIT_PROTOCOL_VERSION,
    scannedRoots: [...SCANNED_ROOTS],
    evidence,
    missingDimensions: AIES_DIMENSIONS.filter((dimension) => !dimensionsWithEvidence.has(dimension)),
  };
}

function countForDimension(evidence: AuditEvidenceItem[], dimension: AiesDimension): number {
  return evidence.filter((item) => item.dimension === dimension).length;
}

function formatEvidenceItem(item: AuditEvidenceItem): string {
  return `- ${item.sourcePath ?? item.sourceType} :: ${item.summary} | excerpt: ${item.excerpt ?? "none"}`;
}

export function formatAuditEvidenceScan(result: AuditEvidenceScanResult, rawArgs = ""): string {
  const requestedDimension = (rawArgs ?? "").trim().toLowerCase() as AiesDimension | "";
  const dimensionFilter = AIES_DIMENSIONS.includes(requestedDimension as AiesDimension)
    ? requestedDimension as AiesDimension
    : null;
  const visibleEvidence = dimensionFilter
    ? result.evidence.filter((item) => item.dimension === dimensionFilter)
    : result.evidence;

  const countsLine = AIES_DIMENSIONS
    .map((dimension) => `${dimension}=${countForDimension(result.evidence, dimension)}`)
    .join(" | ");

  const groupedLines = (dimensionFilter ? [dimensionFilter] : [...AIES_DIMENSIONS])
    .flatMap((dimension) => {
      const items = visibleEvidence.filter((item) => item.dimension === dimension);
      if (items.length === 0) {
        return [`${dimension.toUpperCase()}: none`];
      }

      return [
        `${dimension.toUpperCase()}:`,
        ...items.map(formatEvidenceItem),
      ];
    });

  return [
    `Audit radar evidence scan @ ${result.observedAt}`,
    `Protocol: ${result.auditProtocolVersion}`,
    `Scanned roots: ${result.scannedRoots.join(", ")}`,
    `Evidence items: ${result.evidence.length}`,
    `Missing dimensions: ${result.missingDimensions.length > 0 ? result.missingDimensions.join(", ") : "none"}`,
    `Coverage: ${countsLine}`,
    ...(dimensionFilter ? [`Filter: ${dimensionFilter}`] : []),
    ...groupedLines,
  ].join("\n");
}
