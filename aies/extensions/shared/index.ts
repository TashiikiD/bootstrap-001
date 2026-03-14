import { mkdirSync } from "node:fs";
import { getAiesProjectConfig } from "./config.ts";
import { AIES_COMMANDS } from "./messages.ts";
import { getAiesPaths } from "./paths.ts";

function ensureRuntimeDirectories(): ReturnType<typeof getAiesPaths> {
  const preliminaryPaths = getAiesPaths();
  const config = getAiesProjectConfig(preliminaryPaths);
  const paths = getAiesPaths(config.runtimeDirName, config.sessionDirName);

  mkdirSync(paths.runtimeRoot, { recursive: true });
  mkdirSync(paths.sessionDir, { recursive: true });

  return paths;
}

function formatPathLines(paths: ReturnType<typeof getAiesPaths>): string[] {
  return [
    `projectRoot=${paths.projectRoot}`,
    `runtimeRoot=${paths.runtimeRoot}`,
    `sessionDir=${paths.sessionDir}`,
    `memoryRoot=${paths.memoryRoot}`,
    `openSpecRoot=${paths.openSpecRoot}`,
    `handoffRoot=${paths.handoffRoot}`,
  ];
}

export default function aiesSharedExtension(pi: any): void {
  const paths = ensureRuntimeDirectories();

  pi.on("session_directory", async () => {
    return { sessionDir: paths.sessionDir };
  });

  pi.registerCommand(AIES_COMMANDS.paths, {
    description: "Show resolved AIES workspace paths",
    handler: async (_args: string, ctx: any) => {
      const lines = formatPathLines(paths);
      if (ctx.hasUI) {
        ctx.ui.notify(lines.join(" | "), "info");
        return;
      }
      console.log(lines.join("\n"));
    },
  });
}

