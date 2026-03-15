import { spawnSync } from "node:child_process";
import { extname } from "node:path";
import type { IsoTimestamp, VerificationMode } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";

export type RepoChangeStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "unknown";
export type VerificationScopeArea = "documentation" | "operator_ui" | "runtime_core" | "runtime_support" | "automation" | "other";

export interface VerificationScopeBaseline {
  capturedAt: IsoTimestamp;
  dirtyPaths: string[];
  scanFailure: string | null;
}

export interface VerificationScopeFile {
  path: string;
  status: RepoChangeStatus;
  previousPath: string | null;
  area: VerificationScopeArea;
}

export interface VerificationScopeReport {
  observedAt: IsoTimestamp;
  baselineCapturedAt: IsoTimestamp | null;
  scanFailure: string | null;
  introducedFiles: VerificationScopeFile[];
  preexistingDirtyPaths: string[];
  totalChangedFiles: number;
  docsOnly: boolean;
  categories: VerificationScopeArea[];
  recommendedMode: VerificationMode;
  rationale: string;
  suggestedCommands: string[];
  summary: string;
}

interface RepoChangeRecord {
  path: string;
  status: RepoChangeStatus;
  previousPath: string | null;
}

interface RepoChangeScanResult {
  changes: RepoChangeRecord[];
  scanFailure: string | null;
}

const MODE_ORDER: VerificationMode[] = ["none", "targeted", "fast", "full"];
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".ps1", ".json"]);
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);
const MEMORY_DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".yaml", ".yml"]);
const FULL_MODE_PATHS = new Set(["verify-aies-quick.ps1", "run-aies-on-pi.ps1", ".pi/settings.json"]);
const RUNTIME_CORE_PREFIXES = [
  "aies/contracts/",
  "aies/extensions/cycle-runner/",
  "aies/extensions/evaluation/",
  "aies/extensions/shared/",
  "aies/extensions/verification/",
];
const RUNTIME_SUPPORT_PREFIXES = [
  "aies/extensions/",
  "aies/prompts/",
  "aies/skills/",
  ".pi/skills/",
];

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

function modeRank(mode: VerificationMode): number {
  const index = MODE_ORDER.indexOf(mode);
  return index >= 0 ? index : 0;
}

export function strongerVerificationMode(left: VerificationMode, right: VerificationMode): VerificationMode {
  return modeRank(left) >= modeRank(right) ? left : right;
}

function parseRepoChangeStatus(rawStatus: string): RepoChangeStatus {
  const compact = rawStatus.replace(/\s+/g, "");
  if (compact === "??") return "untracked";

  const marker = compact[0] ?? compact[compact.length - 1] ?? "";
  switch (marker) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "unknown";
  }
}

function parseGitStatusLine(line: string): RepoChangeRecord | null {
  const raw = line.trimEnd();
  if (!raw) {
    return null;
  }

  const status = parseRepoChangeStatus(raw.slice(0, 2));
  const remainder = normalizePath(raw.slice(3));
  if (!remainder) {
    return null;
  }

  if (remainder.includes(" -> ")) {
    const [previousPath, nextPath] = remainder.split(" -> ").map((part) => normalizePath(part));
    if (!nextPath) {
      return null;
    }

    return {
      path: nextPath,
      status,
      previousPath: previousPath || null,
    };
  }

  return {
    path: remainder,
    status,
    previousPath: null,
  };
}

function scanRepoChanges(): RepoChangeScanResult {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    {
      cwd: getAiesPaths().projectRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.error) {
    return {
      changes: [],
      scanFailure: normalize(result.error.message),
    };
  }

  if ((result.status ?? 0) !== 0) {
    const stderr = typeof result.stderr === "string" ? normalize(result.stderr) : "";
    return {
      changes: [],
      scanFailure: stderr || `git status exited with ${result.status ?? "unknown"}.`,
    };
  }

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const changes = stdout
    .split(/\r?\n/)
    .map((line) => parseGitStatusLine(line))
    .filter((entry): entry is RepoChangeRecord => entry !== null);

  return {
    changes,
    scanFailure: null,
  };
}

function isDocumentationLike(path: string): boolean {
  const normalizedPath = normalizePath(path);
  const extension = extname(normalizedPath).toLowerCase();

  if (DOC_EXTENSIONS.has(extension) && !normalizedPath.startsWith(".pi/")) {
    return true;
  }

  if (normalizedPath.startsWith("docs/")) {
    return !CODE_EXTENSIONS.has(extension);
  }

  if (normalizedPath.startsWith("openspec/")) {
    return !CODE_EXTENSIONS.has(extension);
  }

  if (normalizedPath.startsWith("memory/")) {
    return MEMORY_DOC_EXTENSIONS.has(extension);
  }

  return false;
}

function classifyVerificationScopeArea(path: string): VerificationScopeArea {
  const normalizedPath = normalizePath(path);

  if (FULL_MODE_PATHS.has(normalizedPath) || normalizedPath.endsWith(".ps1") || normalizedPath.startsWith(".pi/")) {
    return "automation";
  }

  if (isDocumentationLike(normalizedPath)) {
    return "documentation";
  }

  if (normalizedPath.startsWith("operator-ui/")) {
    return "operator_ui";
  }

  if (RUNTIME_CORE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return "runtime_core";
  }

  if (RUNTIME_SUPPORT_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return "runtime_support";
  }

  return "other";
}

function changeTouchesVerificationSubstrate(file: VerificationScopeFile): boolean {
  return FULL_MODE_PATHS.has(file.path);
}

function changeTouchesCoreRuntime(file: VerificationScopeFile): boolean {
  return file.area === "runtime_core";
}

function changeTouchesCode(file: VerificationScopeFile): boolean {
  return file.area !== "documentation";
}

function describeFiles(files: VerificationScopeFile[]): string {
  if (files.length === 0) {
    return "none";
  }

  const preview = files.slice(0, 4).map((file) => file.path);
  const suffix = files.length > 4 ? ` (+${files.length - 4} more)` : "";
  return `${preview.join(", ")}${suffix}`;
}

function buildSuggestedCommands(mode: VerificationMode, categories: VerificationScopeArea[]): string[] {
  if (mode === "none") {
    return [];
  }

  const commands: string[] = [];
  if (categories.includes("runtime_core") || categories.includes("runtime_support") || categories.includes("automation")) {
    commands.push("./verify-aies-quick.ps1");
  }
  if (categories.includes("operator_ui")) {
    commands.push("cd operator-ui && npm run build");
    commands.push("cd operator-ui && npx tsc --noEmit");
  }
  if (mode === "full") {
    commands.push("Run a broader suite beyond ./verify-aies-quick.ps1 because the verification substrate itself changed.");
  }
  if (mode === "targeted") {
    commands.push("Run one focused check that directly exercises the edited area.");
  }

  return [...new Set(commands)];
}

function recommendVerificationMode(files: VerificationScopeFile[], scanFailure: string | null): {
  recommendedMode: VerificationMode;
  rationale: string;
} {
  if (scanFailure) {
    return {
      recommendedMode: "fast",
      rationale: `Git-based change-surface scan failed (${scanFailure}), so the harness falls back to fast verification instead of under-claiming trust.`,
    };
  }

  if (files.length === 0) {
    return {
      recommendedMode: "none",
      rationale: "No repo changes were introduced since the cycle-run baseline.",
    };
  }

  if (files.every((file) => file.area === "documentation")) {
    return {
      recommendedMode: "none",
      rationale: `All cycle-introduced changes are documentation/theory/planning files (${describeFiles(files)}).`,
    };
  }

  if (files.some(changeTouchesVerificationSubstrate)) {
    return {
      recommendedMode: "full",
      rationale: `The cycle changed verification-orchestration substrate files (${describeFiles(files.filter(changeTouchesVerificationSubstrate))}), so quick verification alone should not be treated as sufficient.`,
    };
  }

  if (files.some(changeTouchesCoreRuntime)) {
    return {
      recommendedMode: "fast",
      rationale: `The cycle touched core runtime/evaluation harness files (${describeFiles(files.filter(changeTouchesCoreRuntime))}), so fast verification is the minimum proportionate floor.`,
    };
  }

  const codeFiles = files.filter(changeTouchesCode);
  if (codeFiles.length > 1) {
    return {
      recommendedMode: "fast",
      rationale: `The cycle touched multiple executable surfaces (${describeFiles(codeFiles)}), so a broader fast verification pass is safer than a single narrow check.`,
    };
  }

  return {
    recommendedMode: "targeted",
    rationale: `The cycle touched one localized executable surface (${describeFiles(codeFiles)}), so targeted verification is proportionate.`,
  };
}

function summarizeVerificationScope(report: VerificationScopeReport): string {
  if (report.scanFailure) {
    return `Change-surface scan failed; recommend ${report.recommendedMode} verification. ${report.rationale}`;
  }

  if (report.introducedFiles.length === 0) {
    return "No repo changes were detected since the cycle-run baseline.";
  }

  return `Touched ${report.introducedFiles.length} file${report.introducedFiles.length === 1 ? "" : "s"} across ${report.categories.join(", ")}; recommend ${report.recommendedMode} verification.`;
}

export function captureVerificationScopeBaseline(): VerificationScopeBaseline {
  const scan = scanRepoChanges();
  const dirtyPaths = scan.changes.flatMap((change) => [change.path, change.previousPath].filter((item): item is string => Boolean(item)));

  return {
    capturedAt: nowIso(),
    dirtyPaths: [...new Set(dirtyPaths.map(normalizePath))].sort((left, right) => left.localeCompare(right)),
    scanFailure: scan.scanFailure,
  };
}

export function createVerificationScopeReport(baseline: VerificationScopeBaseline | null): VerificationScopeReport {
  const scan = scanRepoChanges();
  const observedAt = nowIso();
  const baselinePaths = new Set((baseline?.dirtyPaths ?? []).map(normalizePath));
  const preexistingDirtyPaths = new Set<string>();

  const introducedFiles = scan.changes
    .filter((change) => {
      const candidatePaths = [change.path, change.previousPath].filter((item): item is string => Boolean(item)).map(normalizePath);
      const alreadyDirty = candidatePaths.some((path) => baselinePaths.has(path));
      if (alreadyDirty) {
        for (const path of candidatePaths.filter((item) => baselinePaths.has(item))) {
          preexistingDirtyPaths.add(path);
        }
      }
      return !alreadyDirty;
    })
    .map((change) => ({
      path: normalizePath(change.path),
      status: change.status,
      previousPath: change.previousPath ? normalizePath(change.previousPath) : null,
      area: classifyVerificationScopeArea(change.path),
    } satisfies VerificationScopeFile));

  const categories = [...new Set(introducedFiles.map((file) => file.area))];
  const recommendation = recommendVerificationMode(introducedFiles, scan.scanFailure ?? baseline?.scanFailure ?? null);

  return {
    observedAt,
    baselineCapturedAt: baseline?.capturedAt ?? null,
    scanFailure: scan.scanFailure ?? baseline?.scanFailure ?? null,
    introducedFiles,
    preexistingDirtyPaths: [...preexistingDirtyPaths].sort((left, right) => left.localeCompare(right)),
    totalChangedFiles: scan.changes.length,
    docsOnly: introducedFiles.length > 0 && introducedFiles.every((file) => file.area === "documentation"),
    categories,
    recommendedMode: recommendation.recommendedMode,
    rationale: recommendation.rationale,
    suggestedCommands: buildSuggestedCommands(recommendation.recommendedMode, categories),
    summary: summarizeVerificationScope({
      observedAt,
      baselineCapturedAt: baseline?.capturedAt ?? null,
      scanFailure: scan.scanFailure ?? baseline?.scanFailure ?? null,
      introducedFiles,
      preexistingDirtyPaths: [...preexistingDirtyPaths],
      totalChangedFiles: scan.changes.length,
      docsOnly: introducedFiles.length > 0 && introducedFiles.every((file) => file.area === "documentation"),
      categories,
      recommendedMode: recommendation.recommendedMode,
      rationale: recommendation.rationale,
      suggestedCommands: buildSuggestedCommands(recommendation.recommendedMode, categories),
      summary: "",
    }),
  };
}

export function formatVerificationScopeReport(report: VerificationScopeReport): string {
  return [
    `Observed at: ${report.observedAt}`,
    `Baseline captured at: ${report.baselineCapturedAt ?? "none"}`,
    `Total changed files: ${report.totalChangedFiles}`,
    `Cycle-introduced files: ${report.introducedFiles.length}`,
    `Categories: ${report.categories.join(", ") || "none"}`,
    `Docs only: ${report.docsOnly ? "yes" : "no"}`,
    `Recommended verification mode: ${report.recommendedMode}`,
    `Rationale: ${report.rationale}`,
    `Suggested commands: ${report.suggestedCommands.join(" | ") || "none"}`,
    `Preexisting dirty paths: ${report.preexistingDirtyPaths.join(", ") || "none"}`,
    `Introduced files: ${report.introducedFiles.map((file) => `${file.status}:${file.path}`).join(" | ") || "none"}`,
    `Scan failure: ${report.scanFailure ?? "none"}`,
    `Summary: ${report.summary}`,
  ].join("\n");
}
