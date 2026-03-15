import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(extensionDir, "..", "..", "..");

export interface AiesPaths {
  projectRoot: string;
  aiesRoot: string;
  runtimeRoot: string;
  sessionDir: string;
  memoryRoot: string;
  knowledgeRoot: string;
  auditRadarRoot: string;
  auditRadarSnapshotsRoot: string;
  auditRadarOutcomesRoot: string;
  auditRadarLoopsRoot: string;
  auditRadarGuidanceOutcomesRoot: string;
  auditRadarGuidanceEffectivenessRoot: string;
  auditRadarGuidanceLearningReviewRoot: string;
  theoryForkRoot: string;
  devlogRoot: string;
  openSpecRoot: string;
  openSpecChangesRoot: string;
  handoffRoot: string;
  promptsRoot: string;
  skillsRoot: string;
}

export function getProjectRoot(): string {
  return projectRoot;
}

export function getAiesPaths(runtimeDirName = ".aies-runtime", sessionDirName = "sessions"): AiesPaths {
  const aiesRoot = resolve(projectRoot, "aies");
  const runtimeRoot = resolve(projectRoot, runtimeDirName);
  const memoryRoot = resolve(projectRoot, "memory");
  const openSpecRoot = resolve(projectRoot, "openspec");

  const knowledgeRoot = resolve(memoryRoot, "knowledge");
  const auditRadarRoot = resolve(knowledgeRoot, "audit-radar");

  return {
    projectRoot,
    aiesRoot,
    runtimeRoot,
    sessionDir: resolve(runtimeRoot, sessionDirName),
    memoryRoot,
    knowledgeRoot,
    auditRadarRoot,
    auditRadarSnapshotsRoot: resolve(auditRadarRoot, "snapshots"),
    auditRadarOutcomesRoot: resolve(auditRadarRoot, "outcomes"),
    auditRadarLoopsRoot: resolve(auditRadarRoot, "loops"),
    auditRadarGuidanceOutcomesRoot: resolve(auditRadarRoot, "guidance-outcomes"),
    auditRadarGuidanceEffectivenessRoot: resolve(auditRadarRoot, "guidance-effectiveness"),
    auditRadarGuidanceLearningReviewRoot: resolve(auditRadarRoot, "guidance-learning"),
    theoryForkRoot: resolve(memoryRoot, "theory-fork"),
    devlogRoot: resolve(memoryRoot, "devlog"),
    openSpecRoot,
    openSpecChangesRoot: resolve(openSpecRoot, "changes"),
    handoffRoot: resolve(projectRoot, "handoffs"),
    promptsRoot: resolve(projectRoot, "aies", "prompts"),
    skillsRoot: resolve(projectRoot, "aies", "skills"),
  };
}

