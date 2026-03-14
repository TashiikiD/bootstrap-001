import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type OperationalDefaultsMode = "off" | "a" | "b";

const TARGET_PROVIDERS = new Set(["codex-lb", "kimi-lb"]);
const VALID_MODES = new Set<OperationalDefaultsMode>(["off", "a", "b"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMode(raw: string | undefined): OperationalDefaultsMode | undefined {
	if (!raw) return undefined;
	const normalized = raw.trim().toLowerCase();
	return VALID_MODES.has(normalized as OperationalDefaultsMode) ? (normalized as OperationalDefaultsMode) : undefined;
}

function updateStatus(mode: OperationalDefaultsMode, ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	if (mode === "off") {
		ctx.ui.setStatus("operational-defaults", undefined);
		return;
	}

	ctx.ui.setStatus("operational-defaults", ctx.ui.theme.fg("accent", `ops:${mode}`));
}

function ensureTextConfig(payload: Record<string, unknown>): Record<string, unknown> {
	const text = isRecord(payload.text) ? { ...payload.text } : {};
	if (!isRecord(text.format)) {
		text.format = { type: "text" };
	}
	return text;
}

function clampMax(current: unknown, cap: number): number {
	if (typeof current === "number" && Number.isFinite(current) && current > 0) {
		return Math.min(current, cap);
	}

	return cap;
}

function applyCodexDefaults(mode: Exclude<OperationalDefaultsMode, "off">, payload: Record<string, unknown>): Record<string, unknown> {
	const next = { ...payload };
	const text = ensureTextConfig(next);

	if (mode === "a") {
		text.verbosity = "low";
		next.reasoning = { effort: "low", summary: "concise" };
		next.max_output_tokens = clampMax(next.max_output_tokens, 8192);
	} else {
		text.verbosity = "high";
		next.reasoning = { effort: "high", summary: "detailed" };
		next.max_output_tokens = clampMax(next.max_output_tokens, 16384);
	}

	next.text = text;
	return next;
}

function applyKimiDefaults(mode: Exclude<OperationalDefaultsMode, "off">, payload: Record<string, unknown>): Record<string, unknown> {
	const next = { ...payload };
	const text = ensureTextConfig(next);

	if (mode === "a") {
		text.verbosity = "low";
		next.reasoning_effort = "low";
		next.max_tokens = clampMax(next.max_tokens ?? next.max_completion_tokens, 4096);
	} else {
		text.verbosity = "high";
		next.reasoning_effort = "high";
		next.max_tokens = clampMax(next.max_tokens ?? next.max_completion_tokens, 8192);
	}

	delete next.max_completion_tokens;
	if (Array.isArray(next.tools) && next.tools.length === 0) {
		delete next.tools;
	}
	if (!Array.isArray(next.tools) || next.tools.length === 0) {
		delete next.tool_choice;
	}

	next.text = text;
	return next;
}

export default function (pi: ExtensionAPI) {
	let activeMode: OperationalDefaultsMode = "off";

	pi.registerFlag("operational-defaults", {
		description: "Operational defaults variant to use (off, a, b)",
		type: "string",
	});

	pi.registerCommand("operational-defaults", {
		description: "Show or set operational defaults mode (off, a, b)",
		handler: async (args, ctx) => {
			const requestedMode = parseMode(args);

			if (!args?.trim()) {
				ctx.ui.notify(`Operational defaults are ${activeMode}. Available: off, a, b`, "info");
				updateStatus(activeMode, ctx);
				return;
			}

			if (!requestedMode) {
				ctx.ui.notify(`Unknown operational defaults mode "${args.trim()}". Use off, a, or b.`, "error");
				return;
			}

			activeMode = requestedMode;
			updateStatus(activeMode, ctx);
			ctx.ui.notify(`Operational defaults set to ${activeMode}`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const rawFlag = pi.getFlag("operational-defaults") as string | undefined;
		const flagMode = parseMode(rawFlag);
		activeMode = flagMode ?? "off";

		if (ctx.hasUI) {
			if (flagMode) {
				ctx.ui.notify(`Operational defaults enabled via flag: ${flagMode}`, "info");
			} else if (rawFlag !== undefined) {
				ctx.ui.notify("Invalid --operational-defaults flag. Using off.", "warning");
			}
		}

		updateStatus(activeMode, ctx);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (activeMode === "off") {
			return undefined;
		}

		const provider = ctx.model?.provider;
		if (!provider || !TARGET_PROVIDERS.has(provider) || !isRecord(event.payload)) {
			return undefined;
		}

		if (provider === "codex-lb") {
			return applyCodexDefaults(activeMode, event.payload);
		}

		if (provider === "kimi-lb") {
			return applyKimiDefaults(activeMode, event.payload);
		}

		return undefined;
	});
}
