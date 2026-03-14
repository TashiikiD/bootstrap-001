import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AiesPaths } from "./paths.ts";

export interface AiesProjectConfig {
  projectName: string;
  runtimeDirName: string;
  sessionDirName: string;
  memoryRoot: string;
  openSpecRoot: string;
  handoffRoot: string;
  canonicalExecutionCore: string;
  controlStyle: string;
}

export function getAiesProjectConfig(paths: AiesPaths): AiesProjectConfig {
  const configPath = resolve(paths.aiesRoot, "config.json");
  const content = readFileSync(configPath, "utf8");
  return JSON.parse(content) as AiesProjectConfig;
}

