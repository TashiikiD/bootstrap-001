import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  appendAction,
  applyRequestDecision,
  buildGeneratedActions,
  buildTimeline,
  controlsFile,
  createAction,
  ensureRuntimeState,
  findLatestCustom,
  listMarkdownFiles,
  loadOperatorRequests,
  listSessionPaths,
  loadActions,
  loadControls,
  memoryRoot,
  openSpecChangesRoot,
  operatorUiRoot,
  parseSession,
  parseThoughtStream,
  parseTranscript,
  readMarkdownSummary,
  runPi,
  saveControls,
  updateAction,
  updateOperatorRequest,
  type ControlState,
  type ParsedSession,
  type PiExecutionResult,
} from "./lib";

const port = Number.parseInt(process.env.AIES_OPERATOR_UI_PORT ?? "4320", 10);
const distRoot = resolve(operatorUiRoot, "dist");
const SESSION_MUTATION_TIMEOUT_MS = 8000;
const PROMPT_TIMEOUT_MS = 180000;
let activePiMutationLabel: string | null = null;

function json(res: any, payload: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function text(res: any, payload: string, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

function readBody(req: any): Promise<any> {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on("error", rejectBody);
  });
}

function getSessions(): ParsedSession[] {
  return listSessionPaths().map(parseSession);
}

function chooseActiveSessionPath(controls: ControlState, sessions: ParsedSession[]): string | null {
  if (controls.activeSessionPath && sessions.some((session) => session.path === controls.activeSessionPath)) {
    return controls.activeSessionPath;
  }
  return sessions[0]?.path ?? null;
}

function panel(title: string, summary: string, bullets: string[], detail: Record<string, unknown>, provenance: Record<string, unknown>) {
  return {
    title,
    id: title.toLowerCase(),
    summary,
    bullets,
    detail,
    provenance,
  };
}

function trimOutput(text: string | null | undefined, maxLength = 300): string | null {
  const normalized = String(text ?? "").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function summarizePiResult(result: PiExecutionResult): string | null {
  return trimOutput(result.stdout) ?? trimOutput(result.stderr) ?? trimOutput(result.errorMessage);
}

function buildSyncFailureNote(label: string, commandText: string, result: PiExecutionResult): string {
  const mode = result.timedOut ? "timed out" : "failed";
  const detail = summarizePiResult(result) ?? "No process output captured.";
  return `${label} sync ${mode} after ${result.durationMs}ms.\nCommand: ${commandText}\nDetail: ${detail}`;
}

function hasActiveMutation(): boolean {
  return activePiMutationLabel !== null;
}

async function runPiSerialized(label: string, args: string[], timeoutMs: number): Promise<PiExecutionResult> {
  if (activePiMutationLabel) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      timedOut: false,
      durationMs: 0,
      args,
      errorMessage: `Another Pi mutation is already running: ${activePiMutationLabel}`,
    };
  }

  activePiMutationLabel = label;
  try {
    return await runPi(args, { timeoutMs });
  } finally {
    activePiMutationLabel = null;
  }
}

function buildState() {
  ensureRuntimeState();
  const sessions = getSessions();
  const controls = loadControls();
  const activeSessionPath = chooseActiveSessionPath(controls, sessions);
  if (controls.activeSessionPath !== activeSessionPath) {
    saveControls({ ...controls, activeSessionPath });
  }
  const activeSession = activeSessionPath ? sessions.find((session) => session.path === activeSessionPath) ?? null : null;
  const entries = activeSession?.entries ?? [];
  const heartbeat = activeSession ? findLatestCustom(entries, "aies-heartbeat")?.data ?? null : null;
  const cycleRunner = activeSession ? findLatestCustom(entries, "aies-cycle-run")?.data ?? null : null;
  const openspec = activeSession ? findLatestCustom(entries, "aies-openspec")?.data ?? null : null;
  const evaluation = activeSession ? findLatestCustom(entries, "aies-evaluation")?.data ?? null : null;
  const verification = activeSession ? findLatestCustom(entries, "aies-verification")?.data ?? null : null;
  const recovery = activeSession ? findLatestCustom(entries, "aies-recovery")?.data ?? null : null;
  const latestModel = [...entries].reverse().find((entry) => entry.type === "model_change") ?? null;
  const transcript = parseTranscript(entries);
  const thoughtStream = parseThoughtStream(entries, cycleRunner);
  const requests = loadOperatorRequests();
  const manualActions = loadActions();
  const generatedActions = buildGeneratedActions(activeSession);
  const actionQueue = [...generatedActions, ...manualActions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const timeline = buildTimeline(activeSession, actionQueue, requests);

  const devlogs = listMarkdownFiles(resolve(memoryRoot, "devlog"));
  const knowledge = listMarkdownFiles(resolve(memoryRoot, "knowledge"));
  const theoryFork = listMarkdownFiles(resolve(memoryRoot, "theory-fork"));
  const latestDevlog = devlogs[0] ? readMarkdownSummary(devlogs[0]) : null;
  const latestDurableFile = knowledge[0] ?? theoryFork[0] ?? null;
  const latestDurable = latestDurableFile ? readMarkdownSummary(latestDurableFile) : null;

  const openSpecFiles = listMarkdownFiles(openSpecChangesRoot).map((filePath) => {
    const { frontmatter, summary, title } = readMarkdownSummary(filePath);
    return {
      changeId: String(frontmatter.change_id ?? basename(filePath, extname(filePath))),
      title,
      status: String(frontmatter.status ?? "unknown"),
      updatedAt: typeof frontmatter.updated_at === "string" ? frontmatter.updated_at : null,
      summary,
      path: filePath,
    };
  });

  const allSessionEntries = sessions.flatMap((session) => session.entries.map((entry) => ({ ...entry, __sessionPath: session.path })));
  const evaluationSnapshots = allSessionEntries.filter((entry) => entry.type === "custom" && entry.customType === "aies-evaluation").map((entry) => entry.data);
  const verificationEntries = allSessionEntries.filter((entry) => entry.type === "custom" && entry.customType === "aies-verification").map((entry) => entry.data);
  const recoveryEntries = allSessionEntries.filter((entry) => entry.type === "custom" && entry.customType === "aies-recovery").map((entry) => entry.data);
  const cycleThoughtEntries = allSessionEntries.filter((entry) => entry.type === "custom" && entry.customType === "aies-cycle-thoughts").map((entry) => entry.data);
  const modelChanges = allSessionEntries.filter((entry) => entry.type === "model_change");

  const dimensionNames = ["prompt", "context", "intent", "judgment", "coherence", "evaluation", "harness"];
  const evaluationTrends = dimensionNames.map((dimension) => {
    const observations = evaluationSnapshots
      .flatMap((snapshot) => snapshot.snapshot?.dimensions ?? [])
      .filter((item: any) => item.dimension === dimension);
    const scored = observations.filter((item: any) => typeof item.score === "number");
    return {
      dimension,
      observations: observations.length,
      averageScore: scored.length > 0 ? Number((scored.reduce((sum: number, item: any) => sum + item.score, 0) / scored.length).toFixed(2)) : null,
    };
  });

  const verificationStats = ["passed", "failed", "partial", "not_run"].map((result) => ({
    result,
    count: verificationEntries.filter((entry) => entry.record?.result === result).length,
  }));
  const recoveryStats = ["open", "resolved", "deferred"].map((status) => ({
    status,
    count: recoveryEntries.filter((entry) => entry.status === status).length,
  }));
  const requestStats = ["open", "approved", "denied", "done"].map((status) => ({
    status,
    count: requests.filter((request) => request.status === status).length,
  }));

  const memoryHighlights = [...knowledge, ...theoryFork].slice(0, 10).map((filePath) => {
    const { frontmatter, title } = readMarkdownSummary(filePath);
    return {
      path: filePath,
      title,
      kind: String(frontmatter.kind ?? "unknown"),
      createdAt: String(frontmatter.created_at ?? new Date(statSync(filePath).mtimeMs).toISOString()),
    };
  });

  const providerUsageMap = new Map<string, number>();
  for (const change of modelChanges) {
    const key = `${change.provider ?? "unknown"}::${change.modelId ?? "unknown"}`;
    providerUsageMap.set(key, (providerUsageMap.get(key) ?? 0) + 1);
  }
  const providerUsage = [...providerUsageMap.entries()].map(([key, count]) => {
    const [provider, model] = key.split("::");
    return { provider, model, count };
  });

  const currentCycle = heartbeat?.currentCycle ?? null;
  const currentPolicyMode = controls.policy.mode;
  const verificationMode = verification?.record?.mode ?? controls.verification.mode ?? "none";
  const verificationResult = verification?.record?.result ?? "not_run";

  const panels = {
    cycleRunner: panel(
      "Cycle Runner",
      cycleRunner ? `${cycleRunner.status} · ${cycleRunner.promptSummary}` : "No explicit cycle run yet",
      [
        `status=${cycleRunner?.status ?? "idle"}`,
        `source=${cycleRunner?.triggerSource ?? "none"}`,
        `change=${cycleRunner?.relatedChangeId ?? "none"}`,
        `cycle=${cycleRunner?.relatedCycleId ?? "pending"}`,
        `promptLines=${typeof cycleRunner?.promptText === "string" ? cycleRunner.promptText.split(/\r?\n/).length : 0}`,
        `thoughtBlocks=${thoughtStream.length}`,
        `failure=${cycleRunner?.failureNote ?? "none"}`,
      ],
      { cycleRunner, activePiMutationLabel, thoughtStream: thoughtStream.slice(0, 6) },
      {
        sourceType: "recorded",
        sourceLabel: "session-entry:aies-cycle-run",
        sourceTimestamp: cycleRunner?.finishedAt ?? cycleRunner?.startedAt ?? null,
        relatedCycleId: cycleRunner?.relatedCycleId ?? null,
        relatedChangeId: cycleRunner?.relatedChangeId ?? null,
        stale: false,
      },
    ),
    heartbeat: panel(
      "Heartbeat",
      currentCycle ? `Phase ${currentCycle.currentPhase} · ${currentCycle.rationale ?? "no rationale"}` : "No active cycle",
      [
        `phase=${currentCycle?.currentPhase ?? "idle"}`,
        `cycle=${currentCycle?.cycleId ?? "none"}`,
        `completed=${heartbeat?.completedCycles ?? 0}`,
        `continuous=${controls.heartbeat.continuousMode}`,
        `intervalMs=${controls.heartbeat.intervalMs}`,
      ],
      {
        heartbeat,
        controls: controls.heartbeat,
      },
      {
        sourceType: "recorded",
        sourceLabel: "session-entry:aies-heartbeat",
        sourceTimestamp: currentCycle?.updatedAt ?? null,
        relatedCycleId: currentCycle?.cycleId ?? null,
        relatedChangeId: currentCycle?.activeChangeId ?? null,
        stale: false,
      },
    ),
    openspec: panel(
      "OpenSpec",
      openspec?.summary ?? "No active change detected",
      [
        `change=${openspec?.context?.activeChangeId ?? "none"}`,
        `task=${openspec?.context?.currentTaskId ?? "none"}`,
        `blocked=${openspec?.context?.blocked ?? false}`,
        `stale=${openspec?.context?.isStale ?? false}`,
      ],
      { openspec, changes: openSpecFiles },
      {
        sourceType: "file-backed",
        sourceLabel: "openspec/changes + session-entry:aies-openspec",
        sourceTimestamp: openspec?.detectedAt ?? null,
        relatedCycleId: null,
        relatedChangeId: openspec?.context?.activeChangeId ?? null,
        stale: Boolean(openspec?.context?.isStale),
      },
    ),
    reasoning: panel(
      "Reasoning / Context",
      currentCycle?.rationale ?? "No current rationale",
      [
        `focus=${currentCycle?.selectedFocus?.focusType ?? "none"}`,
        `policy=${currentPolicyMode}`,
        `prompt=${heartbeat?.lastPromptText ? String(heartbeat.lastPromptText).slice(0, 80) : "none"}`,
        `assistant=${heartbeat?.lastAssistantText ? String(heartbeat.lastAssistantText).slice(0, 80) : "none"}`,
      ],
      {
        currentCycle,
        latestPrompt: heartbeat?.lastPromptText ?? null,
        latestAssistant: heartbeat?.lastAssistantText ?? null,
        appliedAdvisories: {
          policyMode: currentPolicyMode,
          openspecSummary: openspec?.summary ?? null,
          evaluationRecommendation: evaluation?.snapshot?.recommendation ?? null,
          verificationFollowup: verification?.recoveryNote ?? null,
        },
      },
      {
        sourceType: "inferred",
        sourceLabel: "heartbeat + local operator controls",
        sourceTimestamp: currentCycle?.updatedAt ?? null,
        relatedCycleId: currentCycle?.cycleId ?? null,
        relatedChangeId: currentCycle?.activeChangeId ?? null,
        stale: false,
      },
    ),
    evaluation: panel(
      "Evaluation",
      evaluation?.snapshot?.recommendation ?? "No evaluation snapshot",
      [
        `confidence=${evaluation?.snapshot?.confidence ?? "none"}`,
        `neglected=${(evaluation?.snapshot?.neglectedDimensions ?? []).join(",") || "none"}`,
        `drift=${(evaluation?.snapshot?.driftMarkers ?? []).join(" | ") || "none"}`,
      ],
      { evaluation },
      {
        sourceType: "recorded",
        sourceLabel: "session-entry:aies-evaluation",
        sourceTimestamp: evaluation?.createdAt ?? null,
        relatedCycleId: evaluation?.cycleId ?? null,
        relatedChangeId: evaluation?.relatedChangeId ?? null,
        stale: false,
      },
    ),
    verification: panel(
      "Verification",
      verification?.recoveryNote ?? `${verificationMode}/${verificationResult}`,
      [
        `mode=${verificationMode}`,
        `result=${verificationResult}`,
        `state=${verification?.record?.verificationState ?? "none"}`,
        `followup=${verification?.record?.followUpRequired ?? false}`,
        `commands=${verification?.record?.commands?.join(" | ") || "none"}`,
        `suggested=${verification?.record?.suggestedCommands?.join(" | ") || "none"}`,
      ],
      { verification, desiredMode: controls.verification, activePiMutationLabel },
      {
        sourceType: verification?.record ? "recorded" : "inferred",
        sourceLabel: verification?.record ? "session-entry:aies-verification" : "local inference",
        sourceTimestamp: verification?.createdAt ?? null,
        relatedCycleId: verification?.cycleId ?? null,
        relatedChangeId: verification?.relatedChangeId ?? null,
        stale: false,
      },
    ),
    recovery: panel(
      "Recovery",
      recovery?.summary ?? "No open recovery debt",
      [
        `status=${recovery?.status ?? "none"}`,
        `reason=${recovery?.reasonType ?? "none"}`,
        `severity=${recovery?.severity ?? "none"}`,
        `next=${recovery?.recommendedNextAction ?? "none"}`,
      ],
      { recovery },
      {
        sourceType: recovery ? "recorded" : "inferred",
        sourceLabel: recovery ? "session-entry:aies-recovery" : "no active recovery",
        sourceTimestamp: recovery?.createdAt ?? null,
        relatedCycleId: recovery?.cycleId ?? null,
        relatedChangeId: recovery?.relatedChangeId ?? null,
        stale: false,
      },
    ),
    memory: panel(
      "Memory",
      latestDevlog?.summary ?? "No devlog yet",
      [
        `latestDevlog=${devlogs[0] ? basename(devlogs[0]) : "none"}`,
        `latestDurable=${latestDurableFile ? basename(latestDurableFile) : "none"}`,
        `knowledge=${knowledge.length}`,
        `theory=${theoryFork.length}`,
      ],
      { latestDevlog, latestDurable, counts: { devlogs: devlogs.length, knowledge: knowledge.length, theoryFork: theoryFork.length } },
      {
        sourceType: "file-backed",
        sourceLabel: "memory/devlog + memory/knowledge + memory/theory-fork",
        sourceTimestamp: devlogs[0] ? new Date(statSync(devlogs[0]).mtimeMs).toISOString() : null,
        relatedCycleId: currentCycle?.cycleId ?? null,
        relatedChangeId: currentCycle?.activeChangeId ?? null,
        stale: false,
      },
    ),
    providers: panel(
      "Providers / Runtime",
      `${controls.provider.provider}/${controls.provider.model}`,
      [
        `currentSessionProvider=${latestModel?.provider ?? "none"}`,
        `currentSessionModel=${latestModel?.modelId ?? "none"}`,
        `selectedProvider=${controls.provider.provider}`,
        `selectedModel=${controls.provider.model}`,
      ],
      {
        controls: controls.provider,
        currentRuntime: {
          provider: latestModel?.provider ?? null,
          model: latestModel?.modelId ?? null,
          sessionPath: activeSessionPath,
          activePiMutationLabel,
          warning: "Pi CLI command output may append prior assistant text on some slash-command runs.",
        },
      },
      {
        sourceType: controls.provider.source === "operator" ? "operator-override" : "runtime",
        sourceLabel: "controls.json + session model_change entries",
        sourceTimestamp: controls.provider.updatedAt,
        relatedCycleId: currentCycle?.cycleId ?? null,
        relatedChangeId: currentCycle?.activeChangeId ?? null,
        stale: false,
      },
    ),
    requests: panel(
      "Requests",
      requests[0]?.summary ?? "No agent-to-user requests",
      [
        `open=${requests.filter((request) => request.status === "open" || request.status === "approved").length}`,
        `latest=${requests[0]?.requestId ?? "none"}`,
        `status=${requests[0]?.status ?? "none"}`,
        `category=${requests[0]?.category ?? "none"}`,
      ],
      { requests },
      {
        sourceType: requests.length > 0 ? "recorded" : "inferred",
        sourceLabel: requests.length > 0 ? "runtime-ledger:requests.json" : "no recorded requests",
        sourceTimestamp: requests[0]?.updatedAt ?? null,
        relatedCycleId: requests[0]?.relatedCycleId ?? null,
        relatedChangeId: requests[0]?.relatedChangeId ?? null,
        stale: false,
      },
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    activeSessionPath,
    sessions: sessions.map((session) => ({
      path: session.path,
      id: session.sessionId,
      title: session.title,
      provider: session.provider,
      model: session.model,
      lastModified: session.lastModified,
      messageCount: session.entries.filter((entry) => entry.type === "message").length,
    })),
    controls: loadControls(),
    transcript,
    thoughtStream,
    panels,
    timeline,
    actionQueue,
    requests,
    observatory: {
      recentCycles: devlogs.slice(0, 8).map((filePath) => {
        const { frontmatter, summary } = readMarkdownSummary(filePath);
        return {
          path: filePath,
          cycleId: frontmatter.cycle_id ?? null,
          focusType: frontmatter.focus_type ?? null,
          verificationMode: frontmatter.verification_mode ?? null,
          verificationResult: frontmatter.verification_result ?? null,
          createdAt: frontmatter.created_at ?? null,
          summary,
        };
      }),
      evaluationTrends,
      verificationStats,
      recoveryStats,
      memoryHighlights,
      openspecChanges: openSpecFiles,
      providerUsage,
      cycleThoughtArchives: cycleThoughtEntries
        .slice()
        .sort((left, right) => String(right.finishedAt ?? right.startedAt ?? "").localeCompare(String(left.finishedAt ?? left.startedAt ?? "")))
        .slice(0, 12)
        .map((entry) => ({
          runId: entry.runId ?? null,
          cycleId: entry.relatedCycleId ?? null,
          relatedChangeId: entry.relatedChangeId ?? null,
          startedAt: entry.startedAt ?? null,
          finishedAt: entry.finishedAt ?? null,
          blockCount: Array.isArray(entry.blocks) ? entry.blocks.length : 0,
          preview: Array.isArray(entry.blocks) && entry.blocks[0]?.text ? String(entry.blocks[0].text) : null,
        })),
    },
  };
}

async function handleMutation(req: any, res: any, path: string) {
  const body = await readBody(req);
  const controls = loadControls();
  const stateBefore = buildState();
  const activeSessionPath = body.sessionPath ?? stateBefore.activeSessionPath;

  const appendSyncAction = (input: {
    category: string;
    summary: string;
    status: "open" | "resolved" | "logged";
    note: string | null;
  }) => {
    appendAction(
      createAction({
        category: input.category,
        summary: input.summary,
        status: input.status,
        origin: "operator",
        relatedCycleId: ((stateBefore.panels.heartbeat.detail as any)?.heartbeat?.currentCycle?.cycleId as string | null | undefined) ?? null,
        relatedChangeId: ((stateBefore.panels.openspec.detail as any)?.openspec?.context?.activeChangeId as string | null | undefined) ?? null,
        resolutionNote: null,
        note: input.note,
      }),
    );
  };

  if (path === "/api/session/select") {
    saveControls({ ...controls, activeSessionPath: body.sessionPath ?? null });
    return json(res, buildState());
  }

  if (path === "/api/prompt") {
    if (!body.prompt) {
      return json(res, { error: "prompt is required" }, 400);
    }
    if (hasActiveMutation()) {
      return json(res, { error: `Pi mutation already in progress: ${activePiMutationLabel}`, state: buildState() }, 409);
    }
    const args = ["-p"];
    if (activeSessionPath) {
      args.push("--session", String(activeSessionPath));
    }
    args.push("--provider", controls.provider.provider, "--model", controls.provider.model, String(body.prompt));
    const result = await runPiSerialized("prompt", args, PROMPT_TIMEOUT_MS);
    if (!result.ok) {
      appendSyncAction({
        category: "prompt-sync",
        summary: result.timedOut ? "Prompt timed out in Pi runtime" : "Prompt failed in Pi runtime",
        status: "open",
        note: buildSyncFailureNote("Prompt", String(body.prompt), result),
      });
      return json(res, { error: buildSyncFailureNote("Prompt", String(body.prompt), result), state: buildState() }, result.timedOut ? 504 : 502);
    }
    appendSyncAction({
      category: "prompt",
      summary: `Prompt sent via operator UI: ${String(body.prompt).slice(0, 80)}`,
      status: "logged",
      note: summarizePiResult(result),
    });
    return json(res, { ok: true, output: result.stdout.trim(), state: buildState() });
  }

  if (path === "/api/controls/trigger") {
    const triggerCommand = "/cycle-run --source operator_ui";
    const nextControls = {
      ...controls,
      heartbeat: {
        ...controls.heartbeat,
        lastTriggerPrompt: triggerCommand,
      },
    };
    saveControls(nextControls);
    if (hasActiveMutation()) {
      appendSyncAction({
        category: "cycle-runner",
        summary: "Cycle run deferred because another Pi mutation is running",
        status: "open",
        note: triggerCommand,
      });
      return json(res, { error: `Pi mutation already in progress: ${activePiMutationLabel}`, state: buildState() }, 409);
    }
    const args = ["-p"];
    if (activeSessionPath) {
      args.push("--session", String(activeSessionPath));
    }
    args.push(triggerCommand);
    const result = await runPiSerialized("heartbeat-trigger", args, PROMPT_TIMEOUT_MS);
    if (!result.ok) {
      appendSyncAction({
        category: "cycle-runner",
        summary: result.timedOut ? "Cycle run command timed out" : "Cycle run command failed",
        status: "open",
        note: buildSyncFailureNote("Cycle run", triggerCommand, result),
      });
      return json(res, { error: buildSyncFailureNote("Cycle run", triggerCommand, result), state: buildState() }, result.timedOut ? 504 : 502);
    }
    appendSyncAction({
      category: "cycle-runner",
      summary: "Cycle run command executed",
      status: "logged",
      note: summarizePiResult(result),
    });
    return json(res, { ok: true, output: result.stdout.trim(), state: buildState() });
  }

  if (path === "/api/controls/heartbeat") {
    const nextControls: ControlState = {
      ...controls,
      heartbeat: {
        ...controls.heartbeat,
        enabled: body.enabled ?? controls.heartbeat.enabled,
        continuousMode: body.continuousMode ?? controls.heartbeat.continuousMode,
        intervalMs: body.intervalMs ?? controls.heartbeat.intervalMs,
      },
    };
    saveControls(nextControls);
    appendAction(
      createAction({
        category: "heartbeat-control",
        summary: "Heartbeat controls updated",
        status: "logged",
        origin: "operator",
        relatedCycleId: null,
        relatedChangeId: null,
        resolutionNote: null,
        note: JSON.stringify(nextControls.heartbeat),
      }),
    );
    return json(res, buildState());
  }

  if (path === "/api/controls/provider-model") {
    const nextControls: ControlState = {
      ...controls,
      provider: {
        provider: String(body.provider ?? controls.provider.provider),
        model: String(body.model ?? controls.provider.model),
        source: "operator",
        updatedAt: new Date().toISOString(),
      },
    };
    saveControls(nextControls);
    appendSyncAction({
      category: "provider-switch",
      summary: `Provider/model preference set to ${nextControls.provider.provider}/${nextControls.provider.model}`,
      status: "logged",
      note: null,
    });
    return json(res, buildState());
  }

  if (path === "/api/controls/policy") {
    const mode = String(body.mode ?? "");
    if (!["off", "advisory", "soft-steer"].includes(mode)) {
      return json(res, { error: "invalid policy mode" }, 400);
    }
    const nextControls: ControlState = {
      ...controls,
      policy: {
        mode: mode as ControlState["policy"]["mode"],
        source: "operator",
        updatedAt: new Date().toISOString(),
      },
    };
    saveControls(nextControls);
    if (activeSessionPath) {
      const commandText = `/aies-policy ${mode}`;
      const result = await runPiSerialized("policy-sync", ["-p", "--session", String(activeSessionPath), commandText], SESSION_MUTATION_TIMEOUT_MS);
      if (!result.ok) {
        appendSyncAction({
          category: "policy-override",
          summary: result.timedOut ? `Policy mode saved locally; session sync timed out for ${mode}` : `Policy mode saved locally; session sync failed for ${mode}`,
          status: "open",
          note: buildSyncFailureNote("Policy", commandText, result),
        });
        return json(res, { ok: true, warning: buildSyncFailureNote("Policy", commandText, result), state: buildState() });
      }
      appendSyncAction({
        category: "policy-override",
        summary: `Policy mode set to ${mode}`,
        status: "logged",
        note: summarizePiResult(result),
      });
      return json(res, buildState());
    }
    appendSyncAction({
      category: "policy-override",
      summary: `Policy mode set to ${mode} locally; no active session selected`,
      status: "logged",
      note: null,
    });
    return json(res, buildState());
  }

  if (path === "/api/controls/verification/mode") {
    const mode = String(body.mode ?? "");
    if (!["none", "targeted", "fast", "full"].includes(mode)) {
      return json(res, { error: "invalid verification mode" }, 400);
    }
    const nextControls: ControlState = {
      ...controls,
      verification: {
        mode: mode as ControlState["verification"]["mode"],
        source: "operator",
        updatedAt: new Date().toISOString(),
      },
    };
    saveControls(nextControls);
    if (activeSessionPath) {
      const commandText = `/verification-mode ${mode}`;
      const result = await runPiSerialized("verification-mode-sync", ["-p", "--session", String(activeSessionPath), commandText], SESSION_MUTATION_TIMEOUT_MS);
      if (!result.ok) {
        appendSyncAction({
          category: "verification-mode",
          summary: result.timedOut ? `Verification mode saved locally; session sync timed out for ${mode}` : `Verification mode saved locally; session sync failed for ${mode}`,
          status: "open",
          note: buildSyncFailureNote("Verification mode", commandText, result),
        });
        return json(res, { ok: true, warning: buildSyncFailureNote("Verification mode", commandText, result), state: buildState() });
      }
      appendSyncAction({
        category: "verification-mode",
        summary: `Verification mode set to ${mode}`,
        status: "logged",
        note: summarizePiResult(result),
      });
      return json(res, buildState());
    }
    appendSyncAction({
      category: "verification-mode",
      summary: `Verification mode set to ${mode} locally; no active session selected`,
      status: "logged",
      note: null,
    });
    return json(res, buildState());
  }

  if (path === "/api/controls/verification/record") {
    if (!activeSessionPath) {
      return json(res, { error: "no active session to record verification against" }, 400);
    }
    const result = String(body.result ?? "passed");
    const commandSummary = String(body.commandSummary ?? "").trim();
    const failureSummary = String(body.failureSummary ?? "").trim();
    const command = `/verification-record ${result}${commandSummary ? ` ${commandSummary}` : ""}${failureSummary ? ` :: ${failureSummary}` : ""}`;
    const syncResult = await runPiSerialized("verification-record-sync", ["-p", "--session", String(activeSessionPath), command], SESSION_MUTATION_TIMEOUT_MS);
    if (!syncResult.ok) {
      appendSyncAction({
        category: "verification-record",
        summary: syncResult.timedOut ? `Verification record timed out for ${result}` : `Verification record failed for ${result}`,
        status: "open",
        note: buildSyncFailureNote("Verification record", command, syncResult),
      });
      return json(res, { ok: true, warning: buildSyncFailureNote("Verification record", command, syncResult), state: buildState() });
    }
    appendSyncAction({
      category: "verification-record",
      summary: `Verification result recorded as ${result}`,
      status: "logged",
      note: commandSummary || summarizePiResult(syncResult),
    });
    return json(res, buildState());
  }

  if (path === "/api/controls/recovery/resolve") {
    if (!activeSessionPath) {
      return json(res, { error: "no active session to resolve recovery against" }, 400);
    }
    const recoveryId = String(body.recoveryId ?? "").trim();
    if (!recoveryId) {
      return json(res, { error: "recoveryId is required" }, 400);
    }
    const note = String(body.note ?? "Resolved from operator UI").trim();
    const command = `/recovery-resolve ${recoveryId}${note ? ` ${note}` : ""}`;
    const syncResult = await runPiSerialized("recovery-resolve-sync", ["-p", "--session", String(activeSessionPath), command], SESSION_MUTATION_TIMEOUT_MS);
    if (!syncResult.ok) {
      appendSyncAction({
        category: "recovery-resolve",
        summary: syncResult.timedOut ? `Recovery resolve timed out for ${recoveryId}` : `Recovery resolve failed for ${recoveryId}`,
        status: "open",
        note: buildSyncFailureNote("Recovery resolve", command, syncResult),
      });
      return json(res, { ok: true, warning: buildSyncFailureNote("Recovery resolve", command, syncResult), state: buildState() });
    }
    appendSyncAction({
      category: "recovery-resolve",
      summary: `Recovery item resolved: ${recoveryId}`,
      status: "logged",
      note: summarizePiResult(syncResult),
    });
    return json(res, buildState());
  }

  if (path === "/api/controls/recovery/defer") {
    if (!activeSessionPath) {
      return json(res, { error: "no active session to defer recovery against" }, 400);
    }
    const recoveryId = String(body.recoveryId ?? "").trim();
    if (!recoveryId) {
      return json(res, { error: "recoveryId is required" }, 400);
    }
    const note = String(body.note ?? "Deferred from operator UI").trim();
    const command = `/recovery-defer ${recoveryId}${note ? ` ${note}` : ""}`;
    const syncResult = await runPiSerialized("recovery-defer-sync", ["-p", "--session", String(activeSessionPath), command], SESSION_MUTATION_TIMEOUT_MS);
    if (!syncResult.ok) {
      appendSyncAction({
        category: "recovery-defer",
        summary: syncResult.timedOut ? `Recovery defer timed out for ${recoveryId}` : `Recovery defer failed for ${recoveryId}`,
        status: "open",
        note: buildSyncFailureNote("Recovery defer", command, syncResult),
      });
      return json(res, { ok: true, warning: buildSyncFailureNote("Recovery defer", command, syncResult), state: buildState() });
    }
    appendSyncAction({
      category: "recovery-defer",
      summary: `Recovery item deferred: ${recoveryId}`,
      status: "logged",
      note: summarizePiResult(syncResult),
    });
    return json(res, buildState());
  }

  const requestMatch = path.match(/^\/api\/requests\/([^/]+)\/status$/);
  if (requestMatch) {
    const requestId = decodeURIComponent(requestMatch[1]);
    const status = typeof body.status === "string" ? body.status : "";
    const comment = typeof body.comment === "string" ? body.comment : null;
    if (!["approved", "denied", "done"].includes(status)) {
      return json(res, { error: "status must be approved, denied, or done" }, 400);
    }
    if (activeSessionPath) {
      const command = status === "approved"
        ? `/user-request-approve ${requestId}${comment ? ` ${comment}` : ""}`
        : status === "denied"
          ? `/user-request-deny ${requestId}${comment ? ` ${comment}` : ""}`
          : `/user-request-done ${requestId}${comment ? ` ${comment}` : ""}`;
      const syncResult = await runPiSerialized(`request-${status}-sync`, ["-p", "--session", String(activeSessionPath), command], SESSION_MUTATION_TIMEOUT_MS);
      if (!syncResult.ok) {
        const updated = updateOperatorRequest(requestId, (request) => applyRequestDecision(request, status as "approved" | "denied" | "done", comment));
        if (!updated) return json(res, { error: "request not found" }, 404);
        appendSyncAction({
          category: "request-sync",
          summary: syncResult.timedOut ? `Request decision saved locally; session sync timed out for ${requestId}` : `Request decision saved locally; session sync failed for ${requestId}` ,
          status: "open",
          note: buildSyncFailureNote("Request decision", command, syncResult),
        });
        return json(res, { ok: true, warning: buildSyncFailureNote("Request decision", command, syncResult), state: buildState() });
      }
      appendSyncAction({
        category: "request-sync",
        summary: `Request ${requestId} updated to ${status}`,
        status: "logged",
        note: summarizePiResult(syncResult),
      });
      return json(res, buildState());
    }
    const updated = updateOperatorRequest(requestId, (request) => applyRequestDecision(request, status as "approved" | "denied" | "done", comment));
    if (!updated) return json(res, { error: "request not found" }, 404);
    appendAction(createAction({
      category: "request-sync",
      summary: `Request ${requestId} updated to ${status} locally`,
      status: "logged",
      origin: "operator",
      relatedCycleId: updated.relatedCycleId ?? null,
      relatedChangeId: updated.relatedChangeId ?? null,
      resolutionNote: null,
      note: comment,
    }));
    return json(res, buildState());
  }

  if (path === "/api/actions") {
    const item = createAction({
      category: String(body.category ?? "manual-note"),
      summary: String(body.summary ?? ""),
      status: "open",
      origin: "operator",
      relatedCycleId: typeof body.relatedCycleId === "string" ? body.relatedCycleId : null,
      relatedChangeId: typeof body.relatedChangeId === "string" ? body.relatedChangeId : null,
      resolutionNote: null,
      note: typeof body.note === "string" ? body.note : null,
    });
    appendAction(item);
    return json(res, buildState());
  }

  const resolveMatch = path.match(/^\/api\/actions\/([^/]+)\/resolve$/);
  if (resolveMatch) {
    const actionId = resolveMatch[1];
    const updated = updateAction(actionId, (action) => ({
      ...action,
      status: "resolved",
      resolutionNote: String(body.resolutionNote ?? "Resolved from operator UI"),
      updatedAt: new Date().toISOString(),
    }));
    if (!updated) {
      return json(res, { error: "action not found" }, 404);
    }
    return json(res, buildState());
  }

  return json(res, { error: `unknown endpoint ${path}` }, 404);
}

function serveStatic(res: any, pathName: string): void {
  const requestedPath = pathName === "/" ? "index.html" : pathName.slice(1);
  const filePath = resolve(distRoot, requestedPath);
  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = ext === ".js"
      ? "text/javascript"
      : ext === ".css"
        ? "text/css"
        : ext === ".html"
          ? "text/html"
          : "application/octet-stream";
    res.writeHead(200, { "Content-Type": `${contentType}; charset=utf-8` });
    res.end(data);
    return;
  } catch {
    try {
      const data = readFileSync(resolve(distRoot, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      text(res, "Operator UI frontend is not built yet. Run `npm run build` in operator-ui or `run-operator-ui.ps1 -Mode build`.", 404);
    }
  }
}

ensureRuntimeState();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, { ok: true, now: new Date().toISOString(), controlsFile });
    }
    if (req.method === "GET" && url.pathname === "/api/requests") {
      return json(res, buildState().requests);
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      return json(res, buildState());
    }
    if (req.method === "GET" && url.pathname === "/api/observatory") {
      return json(res, buildState().observatory);
    }
    if (req.method === "GET" && url.pathname === "/api/timeline") {
      return json(res, buildState().timeline);
    }
    if (req.method === "GET" && url.pathname === "/api/actions") {
      return json(res, buildState().actionQueue);
    }
    if (req.method === "POST") {
      return await handleMutation(req, res, url.pathname);
    }

    return serveStatic(res, url.pathname);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    return json(res, { error: message }, 500);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`AIES operator backend listening on http://127.0.0.1:${port}`);
});
