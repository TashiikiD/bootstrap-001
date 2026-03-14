import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAiesProjectConfig } from "../shared/config.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { buildPolicyPrompt } from "./prompt.ts";
import { POLICY_MODE_ENTRY_TYPE } from "./state.ts";
import { parsePolicyMode, type PolicyMode } from "./types.ts";

const DEFAULT_POLICY_MODE: PolicyMode = "advisory";

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function updateStatus(mode: PolicyMode, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  if (mode === "off") {
    ctx.ui.setStatus(AIES_STATUS_KEYS.policy, undefined);
    return;
  }

  ctx.ui.setStatus(AIES_STATUS_KEYS.policy, ctx.ui.theme.fg("accent", `policy:${mode}`));
}

function getConfig() {
  return getAiesProjectConfig(getAiesPaths());
}

function persistMode(pi: ExtensionAPI, mode: PolicyMode): void {
  pi.appendEntry(POLICY_MODE_ENTRY_TYPE, {
    mode,
    updatedAt: new Date().toISOString(),
  });
}

export default function aiesPolicyExtension(pi: ExtensionAPI): void {
  let activeMode: PolicyMode = DEFAULT_POLICY_MODE;

  pi.registerFlag("aies-policy", {
    description: "AIES policy mode to use (off, advisory, soft-steer)",
    type: "string",
  });

  pi.registerCommand(AIES_COMMANDS.policy, {
    description: "Show or set the AIES policy mode (off, advisory, soft-steer)",
    handler: async (args, ctx) => {
      const requestedMode = parsePolicyMode(args);

      if (!args?.trim()) {
        writeLine(ctx, `AIES policy mode is ${activeMode}. Available: off, advisory, soft-steer`);
        updateStatus(activeMode, ctx);
        return;
      }

      if (!requestedMode) {
        writeLine(ctx, `Unknown AIES policy mode "${args.trim()}". Use off, advisory, or soft-steer.`, "error");
        return;
      }

      activeMode = requestedMode;
      persistMode(pi, activeMode);
      updateStatus(activeMode, ctx);
      writeLine(ctx, `AIES policy mode set to ${activeMode}`);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const rawFlag = pi.getFlag("aies-policy") as string | undefined;
    const flagMode = parsePolicyMode(rawFlag);
    activeMode = flagMode ?? DEFAULT_POLICY_MODE;

    if (rawFlag !== undefined && !flagMode) {
      writeLine(ctx, "Invalid --aies-policy flag. Using advisory.", "warning");
    }

    updateStatus(activeMode, ctx);
    persistMode(pi, activeMode);
  });

  pi.on("session_switch", async (_event, ctx) => {
    updateStatus(activeMode, ctx);
  });

  pi.on("before_agent_start", async (event) => {
    if (activeMode === "off") {
      return undefined;
    }

    const config = getConfig();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPolicyPrompt(activeMode, config)}`,
    };
  });
}
