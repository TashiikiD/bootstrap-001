import { getAiesProjectConfig } from "../shared/config.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";

function getWidgetLines(): string[] {
  const paths = getAiesPaths();
  const config = getAiesProjectConfig(paths);

  return [
    `${config.projectName} bootstrap loaded`,
    `control=${config.controlStyle}`,
    `core=${config.canonicalExecutionCore}`,
    `openspec=${paths.openSpecRoot}`,
    `runtime=${paths.runtimeRoot}`,
  ];
}

function applyBootstrapUi(ctx: any): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.setStatus(AIES_STATUS_KEYS.bootstrap, "AIES v2 bootstrap loaded");
  ctx.ui.setWidget(AIES_WIDGET_KEYS.bootstrap, getWidgetLines());
}

export default function aiesOperatorUiExtension(pi: any): void {
  pi.registerCommand(AIES_COMMANDS.status, {
    description: "Show AIES Phase 0 bootstrap status",
    handler: async (_args: string, ctx: any) => {
      const lines = getWidgetLines();
      applyBootstrapUi(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify("AIES Phase 0 bootstrap is active", "info");
        return;
      }
      console.log(lines.join("\n"));
    },
  });

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    applyBootstrapUi(ctx);
  });

  pi.on("session_switch", async (_event: unknown, ctx: any) => {
    applyBootstrapUi(ctx);
  });
}

