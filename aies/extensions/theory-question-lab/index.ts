import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AIES_DIMENSIONS,
  type AiesDimension,
  type IsoTimestamp,
} from "../../contracts/primitives.ts";
import type {
  TheoryExperimentCandidate,
  TheoryExperimentRiskLevel,
  TheoryExperimentShape,
  TheoryExperimentVerificationFloor,
  TheoryQuestionEntry,
  TheoryQuestionLabReport,
  TheoryQuestionSourceKind,
} from "../../contracts/theory-question-lab.ts";
import { getAiesPaths } from "../shared/paths.ts";

const THEORY_QUESTION_LAB_FILE_NAME = "latest.json";
const HOTSPOT_PATH_PREFIXES = [
  "aies/extensions/evaluation",
  "aies/extensions/cycle-runner",
  "aies/extensions/verification",
  "operator-ui/server",
] as const;

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function compact(text: string | null | undefined, maxLength = 220): string {
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

function sourceKindForPath(relativePath: string): TheoryQuestionSourceKind {
  if (relativePath.includes("/layers/")) {
    return "layer";
  }
  if (relativePath.includes("/meta/")) {
    return "meta";
  }
  return "index";
}

function sourceDimensionsForPath(relativePath: string): AiesDimension[] {
  const normalized = relativePath.toLowerCase();
  return AIES_DIMENSIONS.filter((dimension) => normalized.includes(`/${dimension}.md`) || normalized.endsWith(`/${dimension}.md`));
}

function firstHeading(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return compact(match?.[1] ?? "Theory question source");
}

function extractOpenQuestionsSection(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === "## Open Questions");
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

function parseBulletedQuestions(section: string): string[] {
  const items: string[] = [];
  let current = "";

  for (const rawLine of section.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (current) {
        items.push(compact(current, 400));
      }
      current = trimmed.slice(2).trim();
      continue;
    }

    if (current) {
      current = `${current} ${trimmed}`;
    }
  }

  if (current) {
    items.push(compact(current, 400));
  }

  return items.filter((item) => item !== "none");
}

function inferQuestionDimensions(question: string, sourcePath: string, sourceTitle: string): AiesDimension[] {
  const combined = `${question}\n${sourcePath}\n${sourceTitle}`.toLowerCase();
  return unique([
    ...sourceDimensionsForPath(sourcePath),
    ...AIES_DIMENSIONS.filter((dimension) => combined.includes(dimension)),
  ]);
}

function inferSuggestedPaths(dimensionHints: AiesDimension[], sourcePath: string): string[] {
  const suggestions = new Set<string>([sourcePath]);
  const pathMap: Record<AiesDimension, string[]> = {
    prompt: ["aies/prompts", "aies/skills", ".pi/skills"],
    context: ["memory", "aies/extensions/memory", "aies/extensions/shared"],
    intent: ["memory/knowledge", "aies/extensions/policy", "openspec/changes"],
    judgment: ["aies/extensions/user-requests", "aies/extensions/policy", "operator-ui"],
    coherence: ["memory/theory-fork", "memory/knowledge", "aies/extensions/shared"],
    evaluation: ["aies/extensions/evaluation", "aies/extensions/verification", "operator-ui/server"],
    harness: ["aies/extensions/cycle-runner", "aies/extensions/verification", "operator-ui"],
  };

  for (const dimension of dimensionHints) {
    for (const suggestedPath of pathMap[dimension] ?? []) {
      suggestions.add(suggestedPath);
    }
  }

  suggestions.add("memory/devlog");
  suggestions.add("openspec/changes");
  return [...suggestions];
}

function inferAmbiguityFlags(question: string): string[] {
  const normalized = question.toLowerCase();
  const flags: string[] = [];

  if (/^(how|what|who|when|where|why)\b/.test(normalized)) {
    flags.push("open_interrogative");
  }
  if (normalized.includes(" or ")) {
    flags.push("multiple_candidate_answers");
  }
  if (normalized.includes("should ")) {
    flags.push("normative_tradeoff");
  }
  if (normalized.includes("how do you") || normalized.includes("how should") || normalized.includes("what is the right")) {
    flags.push("underspecified_method");
  }

  return flags;
}

function inferExperimentShape(question: string, dimensionHints: AiesDimension[], suggestedPaths: string[]): TheoryExperimentShape {
  const normalized = question.toLowerCase();

  if (dimensionHints.includes("prompt")) {
    return "skill";
  }
  if (normalized.includes("who") || normalized.includes("authority") || normalized.includes("process") || normalized.includes("governance")) {
    return "openspec_plan";
  }
  if (dimensionHints.some((dimension) => dimension === "evaluation" || dimension === "harness")) {
    return "runtime_module";
  }
  if (suggestedPaths.some((pathValue) => pathValue.startsWith("memory/theory-fork"))) {
    return "tool";
  }
  return "tool";
}

function inferVerificationFloor(shape: TheoryExperimentShape, suggestedPaths: string[]): TheoryExperimentVerificationFloor {
  if (shape === "openspec_plan" || shape === "theory_update") {
    return "docs_only";
  }
  if (suggestedPaths.some((pathValue) => pathValue.startsWith("aies/extensions/cycle-runner") || pathValue.startsWith("aies/extensions/verification"))) {
    return "fast";
  }
  if (suggestedPaths.some((pathValue) => pathValue.startsWith("operator-ui") || pathValue.startsWith("aies/extensions"))) {
    return "targeted";
  }
  return "docs_only";
}

function inferRiskLevel(
  shape: TheoryExperimentShape,
  minimumVerificationFloor: TheoryExperimentVerificationFloor,
): TheoryExperimentRiskLevel {
  if (minimumVerificationFloor === "fast") {
    return "high";
  }
  if (shape === "runtime_module" || minimumVerificationFloor === "targeted") {
    return "medium";
  }
  return "low";
}

function inferBreadthSignals(dimensionHints: AiesDimension[], suggestedPaths: string[]): string[] {
  const signals: string[] = [];

  if (dimensionHints.some((dimension) => ["prompt", "intent", "judgment", "coherence"].includes(dimension))) {
    signals.push("neglected_layer_rotation");
  }
  if (dimensionHints.length > 1) {
    signals.push("cross_layer_question");
  }
  if (suggestedPaths.some((pathValue) => HOTSPOT_PATH_PREFIXES.some((prefix) => pathValue.startsWith(prefix)))) {
    signals.push("touches_existing_hotspot");
  }

  return signals;
}

function buildWhyNow(dimensionHints: AiesDimension[], breadthSignals: string[]): string {
  if (breadthSignals.includes("neglected_layer_rotation")) {
    return compact(`Good rotation candidate: ${dimensionHints.join(", ") || "unspecified"} is less tooled than the recent evaluation-heavy hotspot, so answering it could broaden future work selection.`);
  }
  if (breadthSignals.includes("cross_layer_question")) {
    return compact(`Cross-layer question: ${dimensionHints.join(", ")} touches multiple AIES dimensions and could reduce theory/runtime drift if probed with one bounded experiment.`);
  }
  return compact(`Advisory experiment candidate grounded in the theory fork. Use it to test uncertainty without auto-selecting the next change.`);
}

function createQuestionId(relativePath: string, index: number): string {
  return `theory-question:${relativePath.replace(/[^a-zA-Z0-9/_-]+/g, "-")}:${index + 1}`;
}

function createCandidate(question: TheoryQuestionEntry): TheoryExperimentCandidate {
  const experimentShape = inferExperimentShape(question.question, question.dimensionHints, question.suggestedPaths);
  const minimumVerificationFloor = inferVerificationFloor(experimentShape, question.suggestedPaths);
  const breadthSignals = inferBreadthSignals(question.dimensionHints, question.suggestedPaths);
  const expectedRisk = inferRiskLevel(experimentShape, minimumVerificationFloor);
  const dimensionLabel = question.dimensionHints.join(", ") || "unspecified";

  return {
    id: `${question.id}:candidate`,
    questionId: question.id,
    title: compact(`Experiment candidate: ${question.sourceTitle}`),
    summary: compact(`Probe whether AIES can make progress on: ${question.question}`),
    whyNow: buildWhyNow(question.dimensionHints, breadthSignals),
    dimensionHints: question.dimensionHints,
    experimentShape,
    suggestedPaths: question.suggestedPaths,
    expectedRisk,
    minimumVerificationFloor,
    breadthSignals,
    citations: [
      {
        sourcePath: question.sourcePath,
        excerpt: compact(`Question (${dimensionLabel}): ${question.question}`, 240),
      },
    ],
  };
}

function emptyDimensionCounts(): Record<AiesDimension, number> {
  return AIES_DIMENSIONS.reduce<Record<AiesDimension, number>>((counts, dimension) => {
    counts[dimension] = 0;
    return counts;
  }, {} as Record<AiesDimension, number>);
}

export function createTheoryQuestionLabReport(): TheoryQuestionLabReport {
  const paths = getAiesPaths();
  const theoryFiles = listMarkdownFiles(paths.theoryForkRoot);
  const questions: TheoryQuestionEntry[] = [];

  for (const filePath of theoryFiles) {
    const content = readFileSync(filePath, "utf8");
    const section = extractOpenQuestionsSection(content);
    if (!section) {
      continue;
    }

    const relativePath = projectRelativePath(filePath);
    const sourceTitle = firstHeading(content);
    const sourceKind = sourceKindForPath(relativePath);
    const questionTexts = parseBulletedQuestions(section);

    for (const [index, questionText] of questionTexts.entries()) {
      const dimensionHints = inferQuestionDimensions(questionText, relativePath, sourceTitle);
      questions.push({
        id: createQuestionId(relativePath, index),
        question: questionText,
        sourcePath: relativePath,
        sourceTitle,
        sourceKind,
        dimensionHints,
        suggestedPaths: inferSuggestedPaths(dimensionHints, relativePath),
        ambiguityFlags: inferAmbiguityFlags(questionText),
        citations: [
          {
            sourcePath: relativePath,
            excerpt: compact(questionText, 240),
          },
        ],
      });
    }
  }

  const candidates = questions.map(createCandidate);
  const questionCountsByDimension = emptyDimensionCounts();

  for (const question of questions) {
    for (const dimension of question.dimensionHints) {
      questionCountsByDimension[dimension] += 1;
    }
  }

  return {
    generatedAt: nowIso(),
    advisoryOnly: true,
    sourceRoot: projectRelativePath(paths.theoryForkRoot),
    summary: {
      sourceCount: unique(questions.map((question) => question.sourcePath)).length,
      questionCount: questions.length,
      candidateCount: candidates.length,
      ambiguousQuestionCount: questions.filter((question) => question.ambiguityFlags.length > 0).length,
      questionCountsByDimension,
    },
    questions,
    candidates,
  };
}

export function persistTheoryQuestionLabReport(report: TheoryQuestionLabReport): string {
  const outputRoot = getAiesPaths().theoryQuestionLabRoot;
  mkdirSync(outputRoot, { recursive: true });
  const outputPath = join(outputRoot, THEORY_QUESTION_LAB_FILE_NAME);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

export function loadLatestTheoryQuestionLabReport(): TheoryQuestionLabReport | null {
  const filePath = join(getAiesPaths().theoryQuestionLabRoot, THEORY_QUESTION_LAB_FILE_NAME);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as TheoryQuestionLabReport;
}
