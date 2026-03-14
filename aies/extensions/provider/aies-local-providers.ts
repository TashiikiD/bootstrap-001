import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const ZERO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
};

const CODEX_LB_BASE_URL = process.env.AIES_CODEX_LB_BASE_URL || process.env.TASHI_CODEX_LB_BASE_URL || "http://127.0.0.1:2455/v1";
const KIMI_LB_BASE_URL = process.env.AIES_KIMI_LB_BASE_URL || process.env.TASHI_KIMI_LB_BASE_URL || "http://127.0.0.1:2465/v1";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("codex-lb", {
		baseUrl: CODEX_LB_BASE_URL,
		apiKey: "local",
		api: "openai-responses",
		models: [
			{
				id: "gpt-5.2",
				name: "GPT-5.2 (codex-lb)",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 272000,
				maxTokens: 32000,
				cost: ZERO_COST,
			},
			{
				id: "gpt-5.3-codex",
				name: "GPT-5.3 Codex (codex-lb)",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 272000,
				maxTokens: 32000,
				cost: ZERO_COST,
			},
			{
				id: "gpt-5.1-codex-mini",
				name: "GPT-5.1 Codex Mini (codex-lb)",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 272000,
				maxTokens: 32000,
				cost: ZERO_COST,
			},
			{
				id: "gpt-5.4",
				name: "GPT-5.4 (codex-lb)",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 272000,
				maxTokens: 32000,
				cost: ZERO_COST,
			},
		],
	});

	pi.registerProvider("kimi-lb", {
		baseUrl: KIMI_LB_BASE_URL,
		apiKey: "local",
		api: "openai-completions",
		models: [
			{
				id: "k2p5",
				name: "Kimi K2.5 (kimi-lb)",
				reasoning: false,
				input: ["text", "image"],
				contextWindow: 128000,
				maxTokens: 32000,
				cost: ZERO_COST,
			},
		],
	});
}
