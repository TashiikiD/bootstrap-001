import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
const serverDir = dirname(fileURLToPath(import.meta.url));
export const operatorUiRoot = resolve(serverDir, "..");
export const projectRoot = resolve(operatorUiRoot, "..");
export const runtimeStateRoot = resolve(projectRoot, ".aies-runtime", "operator-ui");
export const actionsFile = resolve(runtimeStateRoot, "actions.json");
export const controlsFile = resolve(runtimeStateRoot, "controls.json");
const configuredPiMonoRoot = process.env.AIES_PI_MONO_ROOT?.trim();
export const piMonoRoot = configuredPiMonoRoot ? resolve(configuredPiMonoRoot) : resolve(projectRoot, "pi-mono");
export const tsxCli = resolve(piMonoRoot, "node_modules", "tsx", "dist", "cli.mjs");
export const piCli = resolve(piMonoRoot, "packages", "coding-agent", "src", "cli.ts");
export const tsconfigPath = resolve(piMonoRoot, "tsconfig.json");
export const sessionsRoot = resolve(projectRoot, ".aies-runtime", "sessions");
export const memoryRoot = resolve(projectRoot, "memory");
export const openSpecChangesRoot = resolve(projectRoot, "openspec", "changes");

export interface OperatorTimelineEvent {
  id: string;
  subsystem: string;
  eventKind: string;
  timestamp: string;
  cycleId: string | null;
  relatedChangeId: string | null;
  summary: string;
  detail: Record<string, unknown>;
  origin: "system" | "operator";
  severity: "info" | "warning" | "error";
}

export interface OperatorActionItem {
  id: string;
  category: string;
  summary: string;
  status: "open" | "resolved" | "logged";
  origin: "system" | "operator";
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  createdAt: string;
  updatedAt: string;
  resolutionNote: string | null;
  note: string | null;
}

export interface OperatorRequestHistoryEntry {
  eventId: string;
  kind: "created" | "approved" | "denied" | "done";
  actor: "agent" | "operator";
  timestamp: string;
  comment: string | null;
}

export interface OperatorRequestItem {
  requestId: string;
  status: "open" | "approved" | "denied" | "done";
  category: "tooling" | "install" | "permission" | "external-agent" | "resource" | "other";
  summary: string;
  details: string;
  requestedBy: "agent";
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  createdAt: string;
  updatedAt: string;
  responseComment: string | null;
  resolutionComment: string | null;
  history: OperatorRequestHistoryEntry[];
}

export interface ThoughtStreamItem {
  id: string;
  runId: string | null;
  cycleId: string | null;
  relatedChangeId: string | null;
  label: string;
  text: string;
  timestamp: string;
  source: "live-message" | "cycle-archive";
}

export interface ControlState {
  activeSessionPath: string | null;
  heartbeat: {
    enabled: boolean;
    continuousMode: boolean;
    intervalMs: number;
    lastTriggerPrompt: string | null;
  };
  provider: {
    provider: string;
    model: string;
    source: "default" | "operator";
    updatedAt: string;
  };
  policy: {
    mode: "off" | "advisory" | "soft-steer";
    source: "default" | "operator";
    updatedAt: string;
  };
  verification: {
    mode: "none" | "targeted" | "fast" | "full";
    source: "default" | "operator";
    updatedAt: string;
  };
}

export interface RunPiOptions {
  timeoutMs?: number;
}

export interface PiExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  args: string[];
  errorMessage: string | null;
}

export interface PiDetachedLaunchResult {
  ok: boolean;
  pid: number | null;
  args: string[];
  errorMessage: string | null;
}

export interface ParsedSession {
  path: string;
  entries: any[];
  sessionId: string;
  provider: string | null;
  model: string | null;
  title: string;
  lastModified: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultControls(): ControlState {
  return {
    activeSessionPath: null,
    heartbeat: {
      enabled: true,
      continuousMode: false,
      intervalMs: 300000,
      lastTriggerPrompt: null,
    },
    provider: {
      provider: "codex-lb",
      model: "gpt-5.2",
      source: "default",
      updatedAt: nowIso(),
    },
    policy: {
      mode: "advisory",
      source: "default",
      updatedAt: nowIso(),
    },
    verification: {
      mode: "none",
      source: "default",
      updatedAt: nowIso(),
    },
  };
}

export function normalizeHeartbeatIntervalMs(value: unknown, fallback = defaultControls().heartbeat.intervalMs): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1000, Math.trunc(parsed));
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function shorten(text: string, length = 120): string {
  const value = normalizeText(text);
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

export function ensureRuntimeState(): void {
  mkdirSync(runtimeStateRoot, { recursive: true });
  if (!existsSync(actionsFile)) {
    writeFileSync(actionsFile, "[]\n", "utf8");
  }
  if (!existsSync(controlsFile)) {
    writeFileSync(
      controlsFile,
      JSON.stringify(defaultControls(), null, 2),
      "utf8",
    );
  }
}

export function loadControls(): ControlState {
  ensureRuntimeState();
  const parsed = JSON.parse(readFileSync(controlsFile, "utf8")) as Partial<ControlState>;
  const defaults = defaultControls();
  const merged: ControlState = {
    activeSessionPath: parsed.activeSessionPath ?? defaults.activeSessionPath,
    heartbeat: {
      ...defaults.heartbeat,
      ...(parsed.heartbeat ?? {}),
      enabled: parsed.heartbeat?.enabled ?? defaults.heartbeat.enabled,
      continuousMode: parsed.heartbeat?.continuousMode ?? defaults.heartbeat.continuousMode,
      intervalMs: normalizeHeartbeatIntervalMs(parsed.heartbeat?.intervalMs, defaults.heartbeat.intervalMs),
    },
    provider: {
      ...defaults.provider,
      ...(parsed.provider ?? {}),
    },
    policy: {
      ...defaults.policy,
      ...(parsed.policy ?? {}),
    },
    verification: {
      ...defaults.verification,
      ...(parsed.verification ?? {}),
    },
  };
  if (JSON.stringify(parsed) !== JSON.stringify(merged)) {
    saveControls(merged);
  }
  return merged;
}

export function saveControls(nextState: ControlState): void {
  ensureRuntimeState();
  writeFileSync(controlsFile, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
}

export function loadActions(): OperatorActionItem[] {
  ensureRuntimeState();
  return JSON.parse(readFileSync(actionsFile, "utf8")) as OperatorActionItem[];
}

export function saveActions(actions: OperatorActionItem[]): void {
  ensureRuntimeState();
  writeFileSync(actionsFile, `${JSON.stringify(actions, null, 2)}\n`, "utf8");
}

export function createAction(input: Omit<OperatorActionItem, "id" | "createdAt" | "updatedAt">): OperatorActionItem {
  const timestamp = nowIso();
  return {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  };
}

export function appendAction(action: OperatorActionItem): void {
  const items = loadActions();
  items.unshift(action);
  saveActions(items.slice(0, 400));
}

export function updateAction(actionId: string, mutator: (action: OperatorActionItem) => OperatorActionItem): OperatorActionItem | null {
  const items = loadActions();
  const index = items.findIndex((item) => item.id === actionId);
  if (index === -1) return null;
  items[index] = mutator(items[index]);
  saveActions(items);
  return items[index];
}

export function readJsonLines(filePath: string): any[] {
  const content = readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function extractTextContent(message: any): string {
  const content = message?.message?.content ?? message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((item) => item?.type === "text")
      .map((item) => String(item.text ?? ""))
      .join("\n")
      .trim();
  }
  return "";
}

function parseThinkingSignature(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as { summary?: Array<{ text?: string }> };
    if (!Array.isArray(parsed.summary)) return [];
    return parsed.summary
      .map((item) => String(item?.text ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function parseThoughtStream(entries: any[], activeRun: any | null): ThoughtStreamItem[] {
  const archived = entries
    .filter((entry) => entry.type === "custom" && entry.customType === "aies-cycle-thoughts")
    .flatMap((entry) => {
      const data = entry.data ?? {};
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      return blocks.map((block: any, index: number) => ({
        id: `${entry.id}-block-${index + 1}`,
        runId: data.runId ?? null,
        cycleId: data.relatedCycleId ?? null,
        relatedChangeId: data.relatedChangeId ?? null,
        label: String(block?.label ?? `Thought ${index + 1}`),
        text: String(block?.text ?? "").trim(),
        timestamp: data.finishedAt ?? entry.timestamp ?? "",
        source: "cycle-archive" as const,
      }));
    })
    .filter((item) => item.text);

  if (!activeRun || activeRun.status !== "running") {
    return archived.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }

  const liveBlocks = entries
    .filter((entry) => entry.type === "message")
    .filter((entry) => {
      const timestamp = String(entry.timestamp ?? entry.message?.timestamp ?? "");
      return timestamp >= String(activeRun.startedAt ?? "");
    })
    .flatMap((entry) => {
      if (entry.message?.role !== "assistant" || !Array.isArray(entry.message?.content)) return [];
      return entry.message.content
        .filter((item: any) => item?.type === "thinking")
        .flatMap((item: any, itemIndex: number) => {
          const summarized = parseThinkingSignature(item.thinkingSignature);
          const fallback = String(item.thinking ?? "").trim();
          const texts = summarized.length > 0 ? summarized : fallback ? [fallback] : [];
          return texts.map((text, textIndex) => ({
            id: `${entry.id}-thinking-${itemIndex + 1}-${textIndex + 1}`,
            runId: activeRun.runId ?? null,
            cycleId: activeRun.relatedCycleId ?? null,
            relatedChangeId: activeRun.relatedChangeId ?? null,
            label: `Thought ${itemIndex + textIndex + 1}`,
            text,
            timestamp: String(entry.timestamp ?? entry.message?.timestamp ?? ""),
            source: "live-message" as const,
          }));
        });
    });

  return [...liveBlocks, ...archived]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .filter((item, index, collection) => collection.findIndex((candidate) => candidate.id === item.id) === index);
}

function parseTitle(entries: any[]): string {
  const currentCycle = findLatestCustom(entries, "aies-heartbeat")?.data?.currentCycle;
  if (currentCycle?.selectedFocus?.focusType && currentCycle?.rationale) {
    return `${String(currentCycle.selectedFocus.focusType).replaceAll("_", " ")} - ${currentCycle.rationale}`;
  }
  const latestUser = [...entries].reverse().find((entry) => entry.type === "message" && entry.message?.role === "user");
  return shorten(extractTextContent(latestUser) || basename(String(entries[0]?.id ?? "session")));
}

export function listSessionPaths(): string[] {
  if (!existsSync(sessionsRoot)) return [];
  return readdirSync(sessionsRoot)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => resolve(sessionsRoot, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

export function parseSession(sessionPath: string): ParsedSession {
  const entries = readJsonLines(sessionPath);
  const latestModel = [...entries].reverse().find((entry) => entry.type === "model_change");
  return {
    path: sessionPath,
    entries,
    sessionId: String(entries.find((entry) => entry.type === "session")?.id ?? basename(sessionPath)),
    provider: latestModel?.provider ?? null,
    model: latestModel?.modelId ?? null,
    title: parseTitle(entries),
    lastModified: new Date(statSync(sessionPath).mtimeMs).toISOString(),
  };
}

export function findLatestCustom(entries: any[], customType: string): any | null {
  return [...entries].reverse().find((entry) => entry.type === "custom" && entry.customType === customType) ?? null;
}

export function parseFrontmatter(markdown: string): Record<string, string | string[]> {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const data: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === "---") break;
    if (!trimmed) continue;

    if (currentKey && trimmed.startsWith("- ")) {
      const current = Array.isArray(data[currentKey]) ? [...data[currentKey] as string[]] : [];
      current.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ""));
      data[currentKey] = current;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      currentKey = null;
      continue;
    }
    const [, key, rawValue] = match;
    if (!rawValue.trim()) {
      data[key] = [];
      currentKey = key;
      continue;
    }
    data[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
    currentKey = null;
  }

  return data;
}

export function parseSection(markdown: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?:\\n## |$)`));
  if (!match) return null;
  return normalizeText(match[1]);
}

export function listMarkdownFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md") && name !== "README.md" && name !== ".gitkeep")
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

export function readMarkdownSummary(filePath: string): { frontmatter: Record<string, string | string[]>; summary: string | null; title: string } {
  const content = readFileSync(filePath, "utf8");
  const frontmatter = parseFrontmatter(content);
  return {
    frontmatter,
    summary: parseSection(content, "Summary"),
    title: String(frontmatter.title ?? frontmatter.id ?? basename(filePath)),
  };
}

export function loadOperatorRequests(): OperatorRequestItem[] {
  ensureRuntimeState();
  const filePath = resolve(runtimeStateRoot, "requests.json");
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n", "utf8");
  }
  return (JSON.parse(readFileSync(filePath, "utf8")) as OperatorRequestItem[])
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function saveOperatorRequests(requests: OperatorRequestItem[]): void {
  ensureRuntimeState();
  const filePath = resolve(runtimeStateRoot, "requests.json");
  writeFileSync(filePath, `${JSON.stringify(requests, null, 2)}\n`, "utf8");
}

export function updateOperatorRequest(
  requestId: string,
  mutator: (request: OperatorRequestItem) => OperatorRequestItem,
): OperatorRequestItem | null {
  const requests = loadOperatorRequests();
  const index = requests.findIndex((request) => request.requestId === requestId);
  if (index < 0) return null;
  requests[index] = mutator(requests[index]);
  saveOperatorRequests(requests);
  return requests[index];
}

export function applyRequestDecision(
  request: OperatorRequestItem,
  status: "approved" | "denied" | "done",
  comment: string | null,
): OperatorRequestItem {
  const trimmed = comment?.trim() || null;
  return {
    ...request,
    status,
    updatedAt: nowIso(),
    responseComment: status === "approved" || status === "denied" ? trimmed : request.responseComment,
    resolutionComment: status === "done" ? trimmed : request.resolutionComment,
    history: [
      {
        eventId: `request-event-${Date.now()}`,
        kind: status,
        actor: "operator",
        timestamp: nowIso(),
        comment: trimmed,
      },
      ...(request.history ?? []),
    ],
  };
}

export function parseTranscript(entries: any[]) {
  return entries
    .filter((entry) => entry.type === "message")
    .filter((entry) => ["user", "assistant"].includes(entry.message?.role ?? ""))
    .map((entry) => ({
      id: entry.id,
      role: entry.message?.role ?? "unknown",
      text: extractTextContent(entry),
      timestamp: entry.timestamp ?? entry.message?.timestamp ?? "",
      provider: entry.message?.provider ?? null,
      model: entry.message?.model ?? null,
    }))
    .filter((entry) => entry.text || entry.role === "assistant");
}

export function buildGeneratedActions(parsedSession: ParsedSession | null): OperatorActionItem[] {
  if (!parsedSession) return [];
  const verification = findLatestCustom(parsedSession.entries, "aies-verification")?.data;
  const recovery = findLatestCustom(parsedSession.entries, "aies-recovery")?.data;
  const openSpec = findLatestCustom(parsedSession.entries, "aies-openspec")?.data;
  const generated: OperatorActionItem[] = [];

  if (verification?.record?.followUpRequired) {
    generated.push({
      id: `generated-verification-${verification.record.recordId}`,
      category: "verification-followup",
      summary: verification.recoveryNote ?? "Verification follow-up required",
      status: "open",
      origin: "system",
      relatedCycleId: verification.cycleId ?? null,
      relatedChangeId: verification.relatedChangeId ?? null,
      createdAt: verification.createdAt ?? verification.record.recordedAt,
      updatedAt: verification.createdAt ?? verification.record.recordedAt,
      resolutionNote: null,
      note: verification.record.commands?.length ? `Commands: ${verification.record.commands.join(" | ")}` : null,
    });
  }

  if (recovery?.status === "open") {
    generated.push({
      id: `generated-recovery-${recovery.recoveryId}`,
      category: "recovery",
      summary: recovery.summary,
      status: "open",
      origin: "system",
      relatedCycleId: recovery.cycleId ?? null,
      relatedChangeId: recovery.relatedChangeId ?? null,
      createdAt: recovery.createdAt ?? nowIso(),
      updatedAt: recovery.createdAt ?? nowIso(),
      resolutionNote: null,
      note: recovery.suggestedCommands?.length ? `Suggested: ${recovery.suggestedCommands.join(" | ")}` : recovery.recommendedNextAction ?? null,
    });
  }

  if (openSpec?.context?.isStale) {
    generated.push({
      id: `generated-openspec-${openSpec.context.activeChangeId ?? "none"}`,
      category: "openspec-stale",
      summary: `OpenSpec context for ${openSpec.context.activeChangeId ?? "current work"} is stale.`,
      status: "open",
      origin: "system",
      relatedCycleId: null,
      relatedChangeId: openSpec.context.activeChangeId ?? null,
      createdAt: openSpec.detectedAt ?? nowIso(),
      updatedAt: openSpec.detectedAt ?? nowIso(),
      resolutionNote: null,
      note: openSpec.summary ?? null,
    });
  }

  return generated;
}

export function buildTimeline(parsedSession: ParsedSession | null, actions: OperatorActionItem[], requests: OperatorRequestItem[] = []): OperatorTimelineEvent[] {
  const events: OperatorTimelineEvent[] = [];

  if (parsedSession) {
    for (const entry of parsedSession.entries) {
      if (entry.type === "model_change") {
        events.push({
          id: entry.id,
          subsystem: "provider",
          eventKind: "model_change",
          timestamp: entry.timestamp,
          cycleId: null,
          relatedChangeId: null,
          summary: `Switched to ${entry.provider}/${entry.modelId}`,
          detail: { provider: entry.provider, model: entry.modelId },
          origin: "system",
          severity: "info",
        });
      }
      if (entry.type === "custom") {
        const data = entry.data ?? {};
        const subsystem = String(entry.customType ?? "custom").replace(/^aies-/, "");
        const cycleId = data.cycleId ?? data.currentCycle?.cycleId ?? null;
        const relatedChangeId = data.relatedChangeId ?? data.context?.activeChangeId ?? data.currentCycle?.activeChangeId ?? null;
        let summary = subsystem;
        let severity: OperatorTimelineEvent["severity"] = "info";
        if (entry.customType === "aies-heartbeat") {
          summary = `Heartbeat phase ${data.currentCycle?.currentPhase ?? "unknown"} · ${data.currentCycle?.rationale ?? "no rationale"}`;
        } else if (entry.customType === "aies-cycle-run") {
          summary = `Cycle runner ${data.status ?? "unknown"} · ${data.promptSummary ?? "no prompt summary"}`;
          severity = data.status === "failed" ? "error" : data.status === "blocked" || data.status === "aborted" ? "warning" : "info";
        } else if (entry.customType === "aies-evaluation") {
          summary = `Evaluation ${data.snapshot?.confidence ?? "unknown"} · ${data.snapshot?.recommendation ?? "no recommendation"}`;
        } else if (entry.customType === "aies-verification") {
          summary = `Verification ${data.record?.mode ?? "none"}/${data.record?.result ?? "not_run"}`;
          severity = data.record?.result === "failed" ? "error" : data.record?.followUpRequired ? "warning" : "info";
        } else if (entry.customType === "aies-recovery") {
          summary = `Recovery ${data.status ?? "unknown"} · ${data.reasonType ?? "none"} · ${data.summary ?? "no summary"}`;
          severity = data.status === "open" && data.severity === "high" ? "error" : data.status === "open" ? "warning" : "info";
        } else if (entry.customType === "aies-openspec") {
          summary = `OpenSpec ${data.context?.activeChangeId ?? "none"} · ${data.summary ?? "no summary"}`;
        } else if (entry.customType === "aies-cycle-thoughts") {
          summary = `Cycle thoughts ${Array.isArray(data.blocks) ? data.blocks.length : 0} blocks · ${data.runId ?? "no run id"}`;
        }
        events.push({
          id: entry.id,
          subsystem,
          eventKind: entry.customType,
          timestamp: entry.timestamp,
          cycleId,
          relatedChangeId,
          summary,
          detail: data,
          origin: "system",
          severity,
        });
      }
      if (entry.type === "message") {
        const role = entry.message?.role ?? "message";
        events.push({
          id: entry.id,
          subsystem: "message",
          eventKind: role,
          timestamp: entry.timestamp,
          cycleId: null,
          relatedChangeId: null,
          summary: `${role}: ${shorten(extractTextContent(entry), 90)}`,
          detail: entry.message ?? {},
          origin: "system",
          severity: "info",
        });
      }
    }
  }

  for (const request of requests) {
    for (const event of request.history ?? []) {
      events.push({
        id: event.eventId,
        subsystem: "requests",
        eventKind: event.kind,
        timestamp: event.timestamp,
        cycleId: request.relatedCycleId ?? null,
        relatedChangeId: request.relatedChangeId ?? null,
        summary: `${event.kind} request ${request.requestId}: ${request.summary}`,
        detail: { request, event },
        origin: event.actor === "operator" ? "operator" : "system",
        severity: event.kind === "denied" ? "warning" : "info",
      });
    }
  }

  for (const action of actions) {
    events.push({
      id: action.id,
      subsystem: action.origin === "operator" ? "operator" : action.category,
      eventKind: action.category,
      timestamp: action.updatedAt,
      cycleId: action.relatedCycleId,
      relatedChangeId: action.relatedChangeId,
      summary: action.summary,
      detail: action as unknown as Record<string, unknown>,
      origin: action.origin,
      severity: action.status === "open" ? "warning" : "info",
    });
  }

  return events.sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 200);
}

export async function runPi(args: string[], options: RunPiOptions = {}): Promise<PiExecutionResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 20000;

  const missingRuntimePaths: string[] = [];
  if (!existsSync(tsxCli)) missingRuntimePaths.push(`tsx runtime not found at ${tsxCli}`);
  if (!existsSync(piCli)) missingRuntimePaths.push(`pi CLI not found at ${piCli}`);
  if (!existsSync(tsconfigPath)) missingRuntimePaths.push(`TypeScript config not found at ${tsconfigPath}`);

  if (missingRuntimePaths.length > 0) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      args,
      errorMessage: `Unable to launch Pi runtime. ${missingRuntimePaths.join("; ")}. Set AIES_PI_MONO_ROOT to a valid pi-mono checkout.`,
    };
  }

  return await new Promise((resolveResult) => {
    execFile(
      "node",
      [tsxCli, "--tsconfig", tsconfigPath, piCli, ...args],
      {
        cwd: projectRoot,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        timeout: timeoutMs,
        killSignal: "SIGTERM",
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;
        if (!error) {
          resolveResult({
            ok: true,
            stdout,
            stderr,
            exitCode: 0,
            signal: null,
            timedOut: false,
            durationMs,
            args,
            errorMessage: null,
          });
          return;
        }

        const execError = error as NodeJS.ErrnoException & {
          code?: number | string | null;
          signal?: NodeJS.Signals | null;
          killed?: boolean;
        };

        resolveResult({
          ok: false,
          stdout,
          stderr,
          exitCode: typeof execError.code === "number" ? execError.code : null,
          signal: execError.signal ?? null,
          timedOut: Boolean(execError.killed) || /timed out/i.test(execError.message),
          durationMs,
          args,
          errorMessage: execError.message,
        });
      },
    );
  });
}

export function runPiDetached(args: string[]): PiDetachedLaunchResult {
  const missingRuntimePaths: string[] = [];
  if (!existsSync(tsxCli)) missingRuntimePaths.push(`tsx runtime not found at ${tsxCli}`);
  if (!existsSync(piCli)) missingRuntimePaths.push(`pi CLI not found at ${piCli}`);
  if (!existsSync(tsconfigPath)) missingRuntimePaths.push(`TypeScript config not found at ${tsconfigPath}`);

  if (missingRuntimePaths.length > 0) {
    return {
      ok: false,
      pid: null,
      args,
      errorMessage: `Unable to launch Pi runtime. ${missingRuntimePaths.join("; ")}. Set AIES_PI_MONO_ROOT to a valid pi-mono checkout.`,
    };
  }

  try {
    const child = spawn(
      "node",
      [tsxCli, "--tsconfig", tsconfigPath, piCli, ...args],
      {
        cwd: projectRoot,
        windowsHide: true,
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
    return {
      ok: true,
      pid: child.pid ?? null,
      args,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      pid: null,
      args,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
