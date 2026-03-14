import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { OpenSpecContext } from "../../contracts/openspec-context.ts";
import { AIES_COMMANDS, AIES_STATUS_KEYS, AIES_WIDGET_KEYS } from "../shared/messages.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { OPENSPEC_ENTRY_TYPE, restoreOpenSpecEntry, type OpenSpecEntry } from "./state.ts";

type BeforeAgentStartEvent = {
  systemPrompt: string;
};

type ParsedChange = {
  filePath: string;
  fileName: string;
  changeId: string;
  title: string;
  status: "proposed" | "active" | "blocked" | "complete" | "archived";
  currentTaskId: string | null;
  pendingTaskIds: string[];
  blocked: boolean;
  blockedReasons: string[];
  updatedAt: string | null;
  summary: string | null;
};

const CHANGE_STATUSES = ["active", "blocked", "proposed"] as const;
const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function writeLine(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function parseScalar(rawValue: string): string | boolean | string[] {
  const value = rawValue.trim();

  if ((value.startsWith(`"`) && value.endsWith(`"`)) || (value.startsWith(`'`) && value.endsWith(`'`))) {
    return value.slice(1, -1);
  }

  if (value === "true") return true;
  if (value === "false") return false;

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => String(parseScalar(item)).trim()).filter(Boolean);
  }

  return value;
}

function parseFrontmatter(markdown: string): Record<string, string | boolean | string[]> {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const data: Record<string, string | boolean | string[]> = {};
  let currentListKey: string | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "---") {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (currentListKey && trimmed.startsWith("- ")) {
      const list = Array.isArray(data[currentListKey]) ? [...(data[currentListKey] as string[])] : [];
      list.push(String(parseScalar(trimmed.slice(2))));
      data[currentListKey] = list;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      currentListKey = null;
      continue;
    }

    const [, key, rawValue] = match;
    if (!rawValue.trim()) {
      data[key] = [];
      currentListKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    currentListKey = null;
  }

  return data;
}

function sectionBody(markdown: string, heading: string): string | null {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = normalized.match(pattern);
  return match?.[1]?.trim() || null;
}

function firstLines(text: string | null, maxLines = 2): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, maxLines);
  if (lines.length === 0) return null;
  return lines.join(" ").slice(0, 280);
}

function asString(value: string | boolean | string[] | undefined): string | null {
  if (value === undefined || Array.isArray(value) || typeof value === "boolean") return null;
  return value.trim() || null;
}

function asStringArray(value: string | boolean | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  const single = asString(value);
  return single ? [single] : [];
}

function asBoolean(value: string | boolean | string[] | undefined): boolean {
  return value === true || value === "true";
}

function parseChangeFile(filePath: string): ParsedChange | null {
  const markdown = readFileSync(filePath, "utf8");
  const frontmatter = parseFrontmatter(markdown);

  const changeId = asString(frontmatter.change_id) ?? basename(filePath, ".md");
  const title = asString(frontmatter.title) ?? changeId;
  const rawStatus = asString(frontmatter.status) ?? "proposed";
  const validStatuses = new Set(["proposed", "active", "blocked", "complete", "archived"]);
  const status = validStatuses.has(rawStatus) ? rawStatus as ParsedChange["status"] : "proposed";

  return {
    filePath,
    fileName: basename(filePath),
    changeId,
    title,
    status,
    currentTaskId: asString(frontmatter.current_task_id),
    pendingTaskIds: asStringArray(frontmatter.pending_task_ids),
    blocked: asBoolean(frontmatter.blocked),
    blockedReasons: asStringArray(frontmatter.blocked_reasons),
    updatedAt: asString(frontmatter.updated_at),
    summary: firstLines(sectionBody(markdown, "Summary")),
  };
}

function scanChanges(): ParsedChange[] {
  const paths = getAiesPaths();
  return readdirSync(paths.openSpecChangesRoot)
    .filter((name) => /^CHG-.*\.md$/i.test(name))
    .map((name) => join(paths.openSpecChangesRoot, name))
    .map((filePath) => {
      try {
        return parseChangeFile(filePath);
      } catch {
        return null;
      }
    })
    .filter((change): change is ParsedChange => change !== null);
}

function updatedAtEpoch(updatedAt: string | null): number {
  if (!updatedAt) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareChanges(left: ParsedChange, right: ParsedChange): number {
  const updatedDiff = updatedAtEpoch(right.updatedAt) - updatedAtEpoch(left.updatedAt);
  if (updatedDiff !== 0) return updatedDiff;
  return left.changeId.localeCompare(right.changeId);
}

function resolveActiveChange(changes: ParsedChange[]): ParsedChange | null {
  for (const status of CHANGE_STATUSES) {
    const matches = changes.filter((change) => change.status === status).sort(compareChanges);
    if (matches.length > 0) {
      return matches[0];
    }
  }

  return null;
}

function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return true;
  return Date.now() - parsed > STALE_WINDOW_MS;
}

function toContext(change: ParsedChange | null): OpenSpecContext {
  const paths = getAiesPaths();
  return {
    rootPath: paths.openSpecRoot,
    activeChangeId: change?.changeId ?? null,
    currentTaskId: change?.currentTaskId ?? null,
    pendingTaskIds: change?.pendingTaskIds ?? [],
    blocked: change?.blocked ?? false,
    blockedReasons: change?.blockedReasons ?? [],
    isStale: change ? isStale(change.updatedAt) : false,
    lastUpdatedAt: change?.updatedAt ?? null,
  };
}

function buildEntry(change: ParsedChange | null): OpenSpecEntry {
  return {
    context: toContext(change),
    title: change?.title ?? null,
    summary: change?.summary ?? null,
    sourcePath: change?.filePath ?? null,
    detectedAt: nowIso(),
  };
}

function persistEntry(pi: ExtensionAPI, entry: OpenSpecEntry): void {
  pi.appendEntry(OPENSPEC_ENTRY_TYPE, entry);
}

function updateUi(entry: OpenSpecEntry, changeCount: number, ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  const changeId = entry.context.activeChangeId ?? "none";
  ctx.ui.setStatus(AIES_STATUS_KEYS.openspec, ctx.ui.theme.fg("accent", `os:${changeId}`));

  const lines = entry.context.activeChangeId
    ? [
        `change=${entry.context.activeChangeId}`,
        `task=${entry.context.currentTaskId ?? "none"}`,
        `blocked=${entry.context.blocked}`,
        `stale=${entry.context.isStale}`,
        `updated=${entry.context.lastUpdatedAt ?? "unknown"}`,
      ]
    : [
        "OpenSpec active",
        "change=none",
        `changes=${changeCount}`,
        `scanned=${entry.detectedAt}`,
      ];

  ctx.ui.setWidget(AIES_WIDGET_KEYS.openspec, lines);
}

function formatStatus(entry: OpenSpecEntry): string {
  if (!entry.context.activeChangeId) {
    return [
      "OpenSpec: no active change",
      `Root: ${entry.context.rootPath}`,
      `Scanned: ${entry.detectedAt}`,
    ].join("\n");
  }

  return [
    `Active change: ${entry.context.activeChangeId}`,
    `Title: ${entry.title ?? "unknown"}`,
    `Current task: ${entry.context.currentTaskId ?? "none"}`,
    `Pending tasks: ${entry.context.pendingTaskIds.length > 0 ? entry.context.pendingTaskIds.join(", ") : "none"}`,
    `Blocked: ${entry.context.blocked}${entry.context.blockedReasons.length > 0 ? ` (${entry.context.blockedReasons.join(", ")})` : ""}`,
    `Stale: ${entry.context.isStale}`,
    `Summary: ${entry.summary ?? "none"}`,
    `Source: ${entry.sourcePath ?? "none"}`,
  ].join("\n");
}

function formatCurrent(entry: OpenSpecEntry): string {
  if (!entry.context.activeChangeId) {
    return "OpenSpec current change: none";
  }

  return [
    `${entry.context.activeChangeId} - ${entry.title ?? "untitled"}`,
    `task=${entry.context.currentTaskId ?? "none"}`,
    `blocked=${entry.context.blocked}`,
    `stale=${entry.context.isStale}`,
    entry.summary ?? "No summary",
  ].join("\n");
}

function formatList(changes: ParsedChange[]): string {
  if (changes.length === 0) {
    return "OpenSpec changes: none";
  }

  return changes
    .sort(compareChanges)
    .map((change) => `${change.changeId} | ${change.status} | ${change.updatedAt ?? "unknown"} | ${change.title}`)
    .join("\n");
}

function buildPromptBlock(entry: OpenSpecEntry): string | null {
  if (!entry.context.activeChangeId) {
    return null;
  }

  const lines = [
    "AIES OPENSPEC CONTEXT",
    `Active change: ${entry.context.activeChangeId}${entry.title ? ` - ${entry.title}` : ""}`,
    `Current task: ${entry.context.currentTaskId ?? "none"}`,
    `Blocked: ${entry.context.blocked}${entry.context.blockedReasons.length > 0 ? ` (${entry.context.blockedReasons.join(", ")})` : ""}`,
  ];

  if (entry.summary) {
    lines.push(`Summary: ${entry.summary}`);
  }

  lines.push("Continue this change when it is relevant, but do not force it if the current turn clearly needs something else.");
  return lines.join("\n");
}

function resolveFromDiskOrFallback(ctx: ExtensionContext): { entry: OpenSpecEntry; changes: ParsedChange[] } {
  try {
    const changes = scanChanges();
    return { entry: buildEntry(resolveActiveChange(changes)), changes };
  } catch {
    const fallback = restoreOpenSpecEntry(ctx) ?? buildEntry(null);
    return { entry: fallback, changes: [] };
  }
}

export default function aiesOpenSpecExtension(pi: ExtensionAPI): void {
  let currentEntry: OpenSpecEntry = buildEntry(null);
  let currentChanges: ParsedChange[] = [];

  function refresh(ctx: ExtensionContext): void {
    const resolved = resolveFromDiskOrFallback(ctx);
    currentEntry = resolved.entry;
    currentChanges = resolved.changes;
    persistEntry(pi, currentEntry);
    updateUi(currentEntry, currentChanges.length, ctx);
  }

  pi.registerCommand(AIES_COMMANDS.openSpecStatus, {
    description: "Show the current AIES OpenSpec context",
    handler: async (_args, ctx) => {
      refresh(ctx);
      writeLine(ctx, formatStatus(currentEntry));
    },
  });

  pi.registerCommand(AIES_COMMANDS.openSpecList, {
    description: "List OpenSpec change files discovered under openspec/changes",
    handler: async (_args, ctx) => {
      refresh(ctx);
      writeLine(ctx, formatList(currentChanges));
    },
  });

  pi.registerCommand(AIES_COMMANDS.openSpecCurrent, {
    description: "Show the active OpenSpec change in compact form",
    handler: async (_args, ctx) => {
      refresh(ctx);
      writeLine(ctx, formatCurrent(currentEntry));
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    refresh(ctx);
    const promptBlock = buildPromptBlock(currentEntry);
    if (!promptBlock) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${promptBlock}`,
    };
  });
}
