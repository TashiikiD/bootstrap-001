import { existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AiesDimension } from "../../aies/contracts/primitives.ts";
import type { TheoryQuestionLabReport } from "../../aies/contracts/theory-question-lab.ts";
import { loadLatestTheoryQuestionLabReport } from "../../aies/extensions/theory-question-lab/index.ts";
import { getAiesPaths } from "../../aies/extensions/shared/paths.ts";
import { projectRoot } from "./lib";

export interface TheoryQuestionLabRecord {
  report: TheoryQuestionLabReport;
  relativePath: string;
  stale: boolean;
  ageHours: number;
  generatedAt: string;
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

function dimensionBullets(counts: Record<AiesDimension, number>): string[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([dimension, count]) => `${dimension}=${count}`);
}

export function readLatestTheoryQuestionLabRecord(): TheoryQuestionLabRecord | null {
  const latestPath = join(getAiesPaths().theoryQuestionLabRoot, "latest.json");
  const report = loadLatestTheoryQuestionLabReport();
  if (!report || !existsSync(latestPath)) {
    return null;
  }

  const ageMs = Math.max(0, Date.now() - Date.parse(report.generatedAt));
  return {
    report,
    relativePath: projectRelativePath(latestPath),
    stale: ageMs > 1000 * 60 * 60 * 12,
    ageHours: Number((ageMs / (1000 * 60 * 60)).toFixed(2)),
    generatedAt: report.generatedAt,
  };
}

export function buildTheoryQuestionLabPanelData(record: TheoryQuestionLabRecord | null) {
  if (!record) {
    return {
      summary: "No persisted theory-question lab report found",
      bullets: [
        "report=missing",
        "questions=0",
        "candidates=0",
        "advisoryOnly=unknown",
      ],
      detail: {
        report: null,
        note: "Run the theory-question lab smoke or a future runtime hook to rebuild this advisory experiment surface.",
      },
      provenance: {
        sourceType: "inferred" as const,
        sourceLabel: "memory/knowledge/theory-question-lab/latest.json",
        sourceTimestamp: null,
        relatedCycleId: null,
        relatedChangeId: "CHG-2026-03-16-theory-question-lab",
        stale: true,
      },
    };
  }

  const topCandidates = record.report.candidates
    .slice()
    .sort((left, right) => {
      const leftRotation = left.breadthSignals.includes("neglected_layer_rotation") ? 1 : 0;
      const rightRotation = right.breadthSignals.includes("neglected_layer_rotation") ? 1 : 0;
      if (leftRotation !== rightRotation) {
        return rightRotation - leftRotation;
      }
      return left.title.localeCompare(right.title);
    })
    .slice(0, 5);

  const latestFileUpdatedAt = statSync(join(projectRoot, record.relativePath)).mtime.toISOString();
  const dimensionHighlights = dimensionBullets(record.report.summary.questionCountsByDimension);
  const latestCandidate = topCandidates[0] ?? null;

  return {
    summary: compact(`Recovered ${record.report.summary.questionCount} theory-fork questions into ${record.report.summary.candidateCount} advisory experiment candidates. Top breadth candidate: ${latestCandidate?.summary ?? "none"}`),
    bullets: [
      `reportPath=${record.relativePath}`,
      `generatedAt=${record.generatedAt}`,
      `ageHours=${record.ageHours}`,
      `questions=${record.report.summary.questionCount}`,
      `candidates=${record.report.summary.candidateCount}`,
      `ambiguous=${record.report.summary.ambiguousQuestionCount}`,
      `advisoryOnly=${record.report.advisoryOnly}`,
      ...dimensionHighlights,
    ],
    detail: {
      report: {
        generatedAt: record.generatedAt,
        advisoryOnly: record.report.advisoryOnly,
        sourceRoot: record.report.sourceRoot,
        summary: record.report.summary,
      },
      topCandidates,
      sampleQuestions: record.report.questions.slice(0, 6),
      latestFileUpdatedAt,
    },
    provenance: {
      sourceType: "file-backed" as const,
      sourceLabel: record.relativePath,
      sourceTimestamp: record.generatedAt,
      relatedCycleId: null,
      relatedChangeId: "CHG-2026-03-16-theory-question-lab",
      stale: record.stale,
    },
  };
}
