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

  return {
    projectRoot,
    aiesRoot,
    runtimeRoot,
    sessionDir: resolve(runtimeRoot, sessionDirName),
    memoryRoot,
    knowledgeRoot: resolve(memoryRoot, "knowledge"),
    theoryForkRoot: resolve(memoryRoot, "theory-fork"),
    devlogRoot: resolve(memoryRoot, "devlog"),
    openSpecRoot,
    openSpecChangesRoot: resolve(openSpecRoot, "changes"),
    handoffRoot: resolve(projectRoot, "handoffs"),
    promptsRoot: resolve(projectRoot, "aies", "prompts"),
    skillsRoot: resolve(projectRoot, "aies", "skills"),
  };
}

