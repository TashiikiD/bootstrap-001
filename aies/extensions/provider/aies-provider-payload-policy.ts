import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type PayloadPolicyMode = "off" | "a" | "b";

const TARGET_PROVIDERS = new Set(["codex-lb", "kimi-lb"]);
const VALID_MODES = new Set<PayloadPolicyMode>(["off", "a", "b"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pruneEmpty(value: unknown): unknown {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (Array.isArray(value)) {
		const items = value.map((item) => pruneEmpty(item)).filter((item) => item !== undefined);
		return items.length > 0 ? items : undefined;
	}

	if (isRecord(value)) {
		const entries = Object.entries(value)
			.map(([key, child]) => [key, pruneEmpty(child)] as const)
			.filter(([, child]) => child !== undefined);

		return entries.length > 0 ? Object.fromEntries(entries) : undefined;
	}

	return value;
}

function parseMode(raw: string | undefined): PayloadPolicyMode | undefined {
	if (!raw) return undefined;
	const normalized = raw.trim().toLowerCase();
	return VALID_MODES.has(normalized as PayloadPolicyMode) ? (normalized as PayloadPolicyMode) : undefined;
}

function updateStatus(mode: PayloadPolicyMode, ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	if (mode === "off") {
		ctx.ui.setStatus("payload-policy", undefined);
		return;
	}

	ctx.ui.setStatus("payload-policy", ctx.ui.theme.fg("accent", `payload:${mode}`));
}

function normalizeCodexPayload(mode: Exclude<PayloadPolicyMode, "off">, payload: Record<string, unknown>): Record<string, unknown> {
	const next: Record<string, unknown> = { ...payload };

	if (Array.isArray(next.tools) && next.tools.length === 0) {
		delete next.tools;
	}

	if (mode === "b") {
		delete next.prompt_cache_key;
		delete next.prompt_cache_retention;
	}

	return (pruneEmpty(next) as Record<string, unknown> | undefined) ?? payload;
}

function normalizeKimiPayload(mode: Exclude<PayloadPolicyMode, "off">, payload: Record<string, unknown>): Record<string, unknown> {
	const next: Record<string, unknown> = { ...payload };

	if (next.max_tokens === undefined && next.max_completion_tokens !== undefined) {
		next.max_tokens = next.max_completion_tokens;
		delete next.max_completion_tokens;
	}

	delete next.stream_options;

	if (Array.isArray(next.tools) && next.tools.length === 0) {
		delete next.tools;
	}

	if (!Array.isArray(next.tools) || next.tools.length === 0) {
		delete next.tool_choice;
	}

	if (mode === "b" && next.store === false) {
		delete next.store;
	}

	return (pruneEmpty(next) as Record<string, unknown> | undefined) ?? payload;
}

export default function (pi: ExtensionAPI) {
	let activeMode: PayloadPolicyMode = "off";

	pi.registerFlag("payload-policy", {
		description: "Payload policy variant to use (off, a, b)",
		type: "string",
	});

	pi.registerCommand("payload-policy", {
		description: "Show or set payload policy mode (off, a, b)",
		handler: async (args, ctx) => {
			const requestedMode = parseMode(args);

			if (!args?.trim()) {
				ctx.ui.notify(`Payload policy is ${activeMode}. Available: off, a, b`, "info");
				updateStatus(activeMode, ctx);
				return;
			}

			if (!requestedMode) {
				ctx.ui.notify(`Unknown payload policy mode "${args.trim()}". Use off, a, or b.`, "error");
				return;
			}

			activeMode = requestedMode;
			updateStatus(activeMode, ctx);
			ctx.ui.notify(`Payload policy set to ${activeMode}`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const flagMode = parseMode(pi.getFlag("payload-policy") as string | undefined);
		activeMode = flagMode ?? "off";

		if (ctx.hasUI) {
			if (flagMode) {
				ctx.ui.notify(`Payload policy enabled via flag: ${flagMode}`, "info");
			} else if (pi.getFlag("payload-policy") !== undefined) {
				ctx.ui.notify("Invalid --payload-policy flag. Using off.", "warning");
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
			return normalizeCodexPayload(activeMode, event.payload);
		}

		if (provider === "kimi-lb") {
			return normalizeKimiPayload(activeMode, event.payload);
		}

		return undefined;
	});
}
