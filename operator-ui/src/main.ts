import { LitElement, html, nothing, type TemplateResult } from "lit";
import type {
  ControlState,
  OperatorActionItem,
  OperatorRequestItem,
  OperatorStateResponse,
  OperatorTimelineEvent,
  PanelState,
  ThoughtStreamItem,
  TranscriptMessage,
  TriggerAudit,
} from "./types";
import "./app.css";

type ViewTab = "live" | "history";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function badgeClassForSeverity(value: string): string {
  switch (value) {
    case "error":
      return "chip error";
    case "warning":
      return "chip warning";
    case "success":
      return "chip success";
    default:
      return "chip info";
  }
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sessionPathLabel(value: string | null | undefined): string {
  if (!value) return "none";
  const normalized = String(value).replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? String(value);
}

class AiesOperatorApp extends LitElement {
  static properties = {
    state: { state: true },
    loading: { state: true },
    error: { state: true },
    activeTab: { state: true },
    timelineSubsystemFilter: { state: true },
    timelineOriginFilter: { state: true },
    timelineChangeFilter: { state: true },
    promptDraft: { state: true },
    actionSummaryDraft: { state: true },
    actionNoteDraft: { state: true },
    verificationCommandDraft: { state: true },
    verificationFailureDraft: { state: true },
    requestCommentDrafts: { state: true },
    triggerPending: { state: true },
    triggerMessage: { state: true },
  };

  declare state: OperatorStateResponse | null;
  declare loading: boolean;
  declare error: string | null;
  declare activeTab: ViewTab;
  declare timelineSubsystemFilter: string;
  declare timelineOriginFilter: string;
  declare timelineChangeFilter: string;
  declare promptDraft: string;
  declare actionSummaryDraft: string;
  declare actionNoteDraft: string;
  declare verificationCommandDraft: string;
  declare verificationFailureDraft: string;
  declare requestCommentDrafts: Record<string, string>;
  declare triggerPending: boolean;
  declare triggerMessage: string | null;
  private refreshTimer: number | null = null;

  constructor() {
    super();
    this.state = null;
    this.loading = true;
    this.error = null;
    this.activeTab = "live";
    this.timelineSubsystemFilter = "all";
    this.timelineOriginFilter = "all";
    this.timelineChangeFilter = "";
    this.promptDraft = "";
    this.actionSummaryDraft = "";
    this.actionNoteDraft = "";
    this.verificationCommandDraft = "";
    this.verificationFailureDraft = "";
    this.requestCommentDrafts = {};
    this.triggerPending = false;
    this.triggerMessage = null;
  }

  createRenderRoot(): this {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.refreshState();
    this.refreshTimer = window.setInterval(() => {
      void this.refreshState();
    }, 5000);
  }

  disconnectedCallback(): void {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    super.disconnectedCallback();
  }

  private async refreshState(): Promise<void> {
    try {
      const response = await fetch("/api/state");
      if (!response.ok) {
        throw new Error(`State request failed with ${response.status}`);
      }
      this.state = await response.json() as OperatorStateResponse;
      this.loading = false;
      this.error = null;
    } catch (error) {
      this.loading = false;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `Request failed: ${response.status}`);
    }
    this.state = (data.state ?? data) as OperatorStateResponse;
    this.error = null;
  }

  private withState(callback: (state: OperatorStateResponse) => TemplateResult): TemplateResult {
    if (this.loading) {
      return html`<div class="content"><div class="card">Loading operator state…</div></div>`;
    }
    if (this.error) {
      return html`<div class="content"><div class="card">Failed to load state: ${this.error}</div></div>`;
    }
    if (!this.state) {
      return html`<div class="content"><div class="card">No operator state available.</div></div>`;
    }
    return callback(this.state);
  }

  private async handleSessionChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    await this.post("/api/session/select", { sessionPath: select.value || null });
  }

  private async submitPrompt(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.promptDraft.trim()) return;
    await this.post("/api/prompt", { prompt: this.promptDraft });
    this.promptDraft = "";
  }

  private async triggerCycle(): Promise<void> {
    const targetSession = this.state?.activeSessionPath ?? this.state?.sessions[0]?.path ?? null;
    this.triggerPending = true;
    this.triggerMessage = `Starting /cycle-run for ${sessionPathLabel(targetSession)}...`;
    try {
      await this.post("/api/controls/trigger", {});
      this.triggerMessage = this.state?.triggerAudit.message ?? "Cycle trigger launched.";
      window.setTimeout(() => void this.refreshState(), 1000);
      window.setTimeout(() => void this.refreshState(), 3000);
      window.setTimeout(() => void this.refreshState(), 7000);
    } finally {
      this.triggerPending = false;
    }
  }

  private async updateHeartbeat(field: Partial<ControlState["heartbeat"]>): Promise<void> {
    await this.post("/api/controls/heartbeat", field);
  }

  private async submitHeartbeatControls(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    await this.updateHeartbeat({
      intervalMs: Number(formData.get("intervalMs") ?? this.state?.controls.heartbeat.intervalMs ?? 300000),
    });
  }

  private async setPolicyMode(mode: ControlState["policy"]["mode"]): Promise<void> {
    await this.post("/api/controls/policy", { mode });
  }

  private async setProviderModel(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    await this.post("/api/controls/provider-model", {
      provider: formData.get("provider"),
      model: formData.get("model"),
    });
  }

  private async setVerificationMode(mode: string): Promise<void> {
    await this.post("/api/controls/verification/mode", { mode });
  }

  private async recordVerification(result: string): Promise<void> {
    await this.post("/api/controls/verification/record", {
      result,
      commandSummary: this.verificationCommandDraft,
      failureSummary: this.verificationFailureDraft,
    });
    this.verificationFailureDraft = "";
    this.requestCommentDrafts = {};
    if (result === "passed") {
      this.verificationCommandDraft = "";
    }
  }

  private async resolveRecovery(): Promise<void> {
    const recoveryId = safeString((this.state?.panels.recovery?.detail as any)?.recovery?.recoveryId);
    if (!recoveryId) return;
    await this.post("/api/controls/recovery/resolve", { recoveryId, note: "Resolved from operator app" });
  }

  private async deferRecovery(): Promise<void> {
    const recoveryId = safeString((this.state?.panels.recovery?.detail as any)?.recovery?.recoveryId);
    if (!recoveryId) return;
    await this.post("/api/controls/recovery/defer", { recoveryId, note: "Deferred from operator app" });
  }

  private async addAction(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.actionSummaryDraft.trim()) return;
    await this.post("/api/actions", {
      category: "manual-note",
      summary: this.actionSummaryDraft,
      note: this.actionNoteDraft,
    });
    this.actionSummaryDraft = "";
    this.actionNoteDraft = "";
  }

  private async resolveAction(actionId: string): Promise<void> {
    await this.post(`/api/actions/${actionId}/resolve`, {
      resolutionNote: "Resolved from operator app",
    });
  }

  private setRequestComment(requestId: string, comment: string): void {
    this.requestCommentDrafts = {
      ...this.requestCommentDrafts,
      [requestId]: comment,
    };
  }

  private async respondToRequest(requestId: string, status: "approved" | "denied" | "done"): Promise<void> {
    await this.post(`/api/requests/${requestId}/status`, {
      status,
      comment: this.requestCommentDrafts[requestId] ?? "",
    });
  }

  private timelineItems(events: OperatorTimelineEvent[]): OperatorTimelineEvent[] {
    return events.filter((event) => {
      if (this.timelineSubsystemFilter !== "all" && event.subsystem !== this.timelineSubsystemFilter) return false;
      if (this.timelineOriginFilter !== "all" && event.origin !== this.timelineOriginFilter) return false;
      if (this.timelineChangeFilter.trim()) {
        const needle = this.timelineChangeFilter.trim().toLowerCase();
        if (!(event.relatedChangeId ?? "").toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }

  private renderPanel(panel: PanelState): TemplateResult {
    return html`
      <section class="panel-card">
        <div class="panel-header">
          <div class="row wrap">
            <div>
              <h3>${panel.title}</h3>
              <div class="summary">${panel.summary}</div>
            </div>
            <div class="pill-summary">
              <span class=${badgeClassForSeverity(panel.provenance.stale ? "warning" : "info")}>
                ${panel.provenance.sourceType}
              </span>
              ${panel.provenance.relatedChangeId
                ? html`<span class="chip">${panel.provenance.relatedChangeId}</span>`
                : nothing}
            </div>
          </div>
        </div>
        <div class="panel-body stack">
          <ul class="bullet-list">
            ${panel.bullets.map((bullet) => html`<li>${bullet}</li>`)}
          </ul>
          <div class="stack small muted">
            <div>Source: ${panel.provenance.sourceLabel}</div>
            <div>Timestamp: ${formatTimestamp(panel.provenance.sourceTimestamp)}</div>
            <div>Cycle: ${panel.provenance.relatedCycleId ?? "none"}</div>
            <div>Change: ${panel.provenance.relatedChangeId ?? "none"}</div>
            <div>Stale: ${panel.provenance.stale ? "yes" : "no"}</div>
          </div>
          ${panel.title === "Cycle Runner" && safeString((panel.detail as any)?.cycleRunner?.promptText)
            ? html`
                <details class="details-block">
                  <summary>Synthesized cycle prompt</summary>
                  <pre>${safeString((panel.detail as any).cycleRunner.promptText)}</pre>
                </details>
              `
            : nothing}
          <details class="details-block">
            <summary>Drill-down / raw detail</summary>
            <pre>${toJson(panel.detail)}</pre>
          </details>
        </div>
      </section>
    `;
  }

  private renderTranscriptItem(message: TranscriptMessage): TemplateResult {
    return html`
      <li class="transcript-item ${message.role}">
        <div class="row wrap">
          <strong>${message.role}</strong>
          <div class="timeline-meta">${formatTimestamp(message.timestamp)}</div>
        </div>
        <div class="summary">${message.text || "(empty message)"}</div>
        <div class="timeline-meta">
          ${message.provider ?? "no-provider"} / ${message.model ?? "no-model"}
        </div>
      </li>
    `;
  }

  private renderThoughtItem(item: ThoughtStreamItem): TemplateResult {
    return html`
      <li class="thought-item ${item.source}">
        <div class="row wrap">
          <div class="pill-summary">
            <span class=${badgeClassForSeverity(item.source === "live-message" ? "info" : "success")}>${item.source}</span>
            <span class="chip">${item.label}</span>
            ${item.relatedChangeId ? html`<span class="chip">${item.relatedChangeId}</span>` : nothing}
          </div>
          <div class="timeline-meta">${formatTimestamp(item.timestamp)}</div>
        </div>
        <div class="summary">${item.text}</div>
        <div class="timeline-meta">
          run=${item.runId ?? "none"} · cycle=${item.cycleId ?? "none"}
        </div>
      </li>
    `;
  }

  private renderTimelineItem(item: OperatorTimelineEvent): TemplateResult {
    return html`
      <li class="timeline-item ${item.severity}">
        <div class="row wrap">
          <div class="pill-summary">
            <span class=${badgeClassForSeverity(item.severity)}>${item.subsystem}</span>
            <span class="chip">${item.origin}</span>
            ${item.relatedChangeId ? html`<span class="chip">${item.relatedChangeId}</span>` : nothing}
          </div>
          <div class="timeline-meta">${formatTimestamp(item.timestamp)}</div>
        </div>
        <div class="summary">${item.summary}</div>
        <details class="details-block">
          <summary>Event payload</summary>
          <pre>${toJson(item.detail)}</pre>
        </details>
      </li>
    `;
  }

  private renderActionItem(item: OperatorActionItem): TemplateResult {
    return html`
      <li class="action-item ${item.status}">
        <div class="row wrap">
          <div class="pill-summary">
            <span class=${badgeClassForSeverity(item.status === "open" ? "warning" : item.status === "resolved" ? "success" : "info")}>
              ${item.category}
            </span>
            <span class="chip">${item.origin}</span>
            <span class="chip">${item.status}</span>
          </div>
          <div class="timeline-meta">${formatTimestamp(item.updatedAt)}</div>
        </div>
        <div class="summary">${item.summary}</div>
        ${item.note ? html`<div class="timeline-meta">${item.note}</div>` : nothing}
        ${item.resolutionNote ? html`<div class="timeline-meta">Resolution: ${item.resolutionNote}</div>` : nothing}
        ${item.status === "open" && item.origin !== "system"
          ? html`<div class="button-row"><button class="button secondary" @click=${() => void this.resolveAction(item.id)}>Resolve</button></div>`
          : nothing}
      </li>
    `;
  }

  private renderRequestItem(item: OperatorRequestItem): TemplateResult {
    const comment = this.requestCommentDrafts[item.requestId] ?? "";
    return html`
      <li class="action-item ${item.status}">
        <div class="row wrap">
          <div class="pill-summary">
            <span class=${badgeClassForSeverity(item.status === "denied" ? "warning" : item.status === "done" ? "success" : "info")}>${item.category}</span>
            <span class="chip">agent</span>
            <span class="chip">${item.status}</span>
            ${item.relatedChangeId ? html`<span class="chip">${item.relatedChangeId}</span>` : nothing}
          </div>
          <div class="timeline-meta">${formatTimestamp(item.updatedAt)}</div>
        </div>
        <div class="summary">${item.summary}</div>
        <div class="timeline-meta">${item.requestId}</div>
        <div class="timeline-meta">${item.details}</div>
        ${item.responseComment ? html`<div class="timeline-meta">Response: ${item.responseComment}</div>` : nothing}
        ${item.resolutionComment ? html`<div class="timeline-meta">Resolution: ${item.resolutionComment}</div>` : nothing}
        ${item.status !== "done" ? html`<div class="field"><label>Operator comment</label><textarea .value=${comment} @input=${(event: Event) => this.setRequestComment(item.requestId, (event.target as HTMLTextAreaElement).value)}></textarea></div><div class="button-row"><button class="button" @click=${() => void this.respondToRequest(item.requestId, "approved")}>Approve</button><button class="button secondary" @click=${() => void this.respondToRequest(item.requestId, "denied")}>Deny</button><button class="button secondary" @click=${() => void this.respondToRequest(item.requestId, "done")}>Mark Done</button></div>` : nothing}
      </li>
    `;
  }

  private renderControls(state: OperatorStateResponse): TemplateResult {
    const controls = state.controls;
    const providerOptions = ["codex-lb", "kimi-lb"];
    const modelOptions = ["gpt-5.2", "gpt-5.3-codex", "gpt-5.4", "gpt-5.1-codex-mini", "k2p5"];
    const latestSession = state.sessions[0] ?? null;
    const triggerAudit = state.triggerAudit as TriggerAudit;
    const triggerMessage = this.triggerMessage ?? triggerAudit.message;
    const pinnedOlderSession = Boolean(
      controls.activeSessionPath
      && latestSession
      && state.activeSessionPath === controls.activeSessionPath
      && state.activeSessionPath !== latestSession.path,
    );
    return html`
      <section class="card stack">
        <div class="row wrap">
          <h2>Operator Controls</h2>
          <div class="button-row">
            <button class="button secondary" @click=${() => void this.refreshState()}>Refresh</button>
            <button class="button" ?disabled=${this.triggerPending} @click=${() => void this.triggerCycle()}>
              ${this.triggerPending ? "Starting..." : "Run Cycle"}
            </button>
          </div>
        <div class="callout small">
          ${triggerMessage ?? "No recent cycle trigger from the operator UI."}
          <br />
          ${`Target session: ${sessionPathLabel(triggerAudit.targetSessionPath ?? state.activeSessionPath ?? latestSession?.path ?? null)} · Status: ${triggerAudit.status}${triggerAudit.lastLaunchPid ? ` · Pi PID ${triggerAudit.lastLaunchPid}` : ""}${triggerAudit.lastWatchWindowPid ? ` · TUI PID ${triggerAudit.lastWatchWindowPid}` : ""}${triggerAudit.lastTriggerAt ? ` · launched ${formatTimestamp(triggerAudit.lastTriggerAt)}` : ""}`}
          <br />
          ${`Active cycle: ${triggerAudit.activeCycleId ?? "none"} · Phase: ${triggerAudit.activeCyclePhase ?? "idle"}`}
        </div>
        </div>
        ${pinnedOlderSession
          ? html`
              <div class="callout small">
                Advisory: controls are pinned to ${sessionPathLabel(state.activeSessionPath)} while the latest session is ${sessionPathLabel(latestSession?.path)}. Run Cycle, prompt sends, and verification/recovery sync actions will keep targeting the selected session until you switch back to <strong>Latest session</strong> or choose another session.
              </div>
            `
          : nothing}
        <div class="form-grid">
          <div class="field">
            <label>Active Session</label>
            <select @change=${(event: Event) => void this.handleSessionChange(event)}>
              <option value="">Latest session</option>
              ${state.sessions.map((session) => html`
                <option value=${session.path} ?selected=${state.activeSessionPath === session.path}>
                  ${session.title}
                </option>
              `)}
            </select>
          </div>
          <div class="field">
            <label>Policy Mode</label>
            <div class="button-row">
              ${(["off", "advisory", "soft-steer"] as const).map((mode) => html`
                <button
                  class=${controls.policy.mode === mode ? "button" : "button secondary"}
                  @click=${() => void this.setPolicyMode(mode)}
                >
                  ${mode}
                </button>
              `)}
            </div>
          </div>
          <div class="field">
            <label>Verification Mode</label>
            <div class="button-row">
              ${(["none", "targeted", "fast", "full"] as const).map((mode) => html`
                <button
                  class=${controls.verification.mode === mode ? "button" : "button secondary"}
                  @click=${() => void this.setVerificationMode(mode)}
                >
                  ${mode}
                </button>
              `)}
            </div>
          </div>
        </div>
        <form class="stack" @submit=${(event: Event) => void this.setProviderModel(event)}>
          <div class="form-grid">
            <div class="field">
              <label>Provider</label>
              <select name="provider">
                ${providerOptions.map((provider) => html`
                  <option value=${provider} ?selected=${controls.provider.provider === provider}>${provider}</option>
                `)}
              </select>
            </div>
            <div class="field">
              <label>Model</label>
              <select name="model">
                ${modelOptions.map((model) => html`
                  <option value=${model} ?selected=${controls.provider.model === model}>${model}</option>
                `)}
              </select>
            </div>
            <div class="field">
              <label>Apply</label>
              <button class="button" type="submit">Set Provider/Model</button>
            </div>
          </div>
        </form>
        <div class="split">
          <form class="stack" @submit=${(event: Event) => void this.submitHeartbeatControls(event)}>
            <h3>Heartbeat cadence</h3>
            <div class="callout small">
              Cadence triggers /cycle-run on the configured interval. Active cycles suppress new automated triggers silently.
            </div>
            <div class="button-row">
              <button
                class=${controls.heartbeat.enabled ? "button warning" : "button success"}
                type="button"
                @click=${() => void this.updateHeartbeat({ enabled: !controls.heartbeat.enabled })}
              >
                ${controls.heartbeat.enabled ? "Stop" : "Start"}
              </button>
              <button
                class=${controls.heartbeat.continuousMode ? "button" : "button secondary"}
                type="button"
                @click=${() => void this.updateHeartbeat({ continuousMode: !controls.heartbeat.continuousMode })}
              >
                Continuous: ${controls.heartbeat.continuousMode ? "on" : "off"}
              </button>
            </div>
            <div class="field">
              <label>Interval (ms)</label>
              <input
                name="intervalMs"
                type="number"
                min="1000"
                .value=${String(controls.heartbeat.intervalMs)}
              />
            </div>
            <div class="button-row">
              <button class="button secondary" type="submit">Apply cadence</button>
            </div>
            <div class="callout small">
              ${(() => {
                const scheduler = (state.panels.heartbeat.detail as any)?.scheduler ?? {};
                const nextHeartbeat = scheduler.nextHeartbeatAt ? formatTimestamp(scheduler.nextHeartbeatAt) : "none";
                const nextContinuous = scheduler.nextContinuousRestartAt ? formatTimestamp(scheduler.nextContinuousRestartAt) : "none";
                const lastSkipped = scheduler.lastSkippedReason ?? "none";
                return `Next cadence: ${nextHeartbeat} · Next continuous: ${nextContinuous} · Last skipped: ${lastSkipped}`;
              })()}
            </div>
          </form>
          <div class="stack">
            <h3>Verification Record</h3>
            <div class="field">
              <label>Command Summary</label>
              <input .value=${this.verificationCommandDraft} @input=${(event: Event) => { this.verificationCommandDraft = (event.target as HTMLInputElement).value; }} />
            </div>
            <div class="field">
              <label>Failure Summary</label>
              <input .value=${this.verificationFailureDraft} @input=${(event: Event) => { this.verificationFailureDraft = (event.target as HTMLInputElement).value; }} />
            </div>
            <div class="button-row">
              <button class="button success" @click=${() => void this.recordVerification("passed")}>Passed</button>
              <button class="button warning" @click=${() => void this.recordVerification("partial")}>Partial</button>
              <button class="button danger" @click=${() => void this.recordVerification("failed")}>Failed</button>
              <button class="button secondary" @click=${() => void this.recordVerification("not_run")}>Not Run</button>
            </div>
            <div class="button-row">
              <button class="button secondary" @click=${() => void this.resolveRecovery()}>Resolve Recovery</button>
              <button class="button secondary" @click=${() => void this.deferRecovery()}>Defer Recovery</button>
            </div>
          </div>
        </div>
        <div class="stack">
          <h3>Prompt / Command</h3>
          <form class="stack" @submit=${(event: Event) => void this.submitPrompt(event)}>
            <div class="field">
              <label>Prompt or slash command</label>
              <textarea
                .value=${this.promptDraft}
                @input=${(event: Event) => { this.promptDraft = (event.target as HTMLTextAreaElement).value; }}
              ></textarea>
            </div>
            <div class="button-row">
              <button class="button" type="submit">Send</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/heartbeat-status"; }}>Heartbeat Status</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/openspec-status"; }}>OpenSpec Status</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/evaluation-status"; }}>Evaluation Status</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/audit-radar-status"; }}>Audit Radar</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/verification-status"; }}>Verification Status</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/verification-plan"; }}>Verification Plan</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/recovery-status"; }}>Recovery Status</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/memory-status"; }}>Memory Status</button>
              <button class="button secondary" type="button" @click=${() => { this.promptDraft = "/user-requests"; }}>User Requests</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  private renderThoughtStream(items: ThoughtStreamItem[]): TemplateResult {
    return html`
      <section class="card stack">
        <div class="row wrap">
          <h2>Cycle Thought Stream</h2>
          <div class="timeline-meta">${items.length} blocks</div>
        </div>
        <div class="callout small">
          During an active cycle run, these blocks update as assistant reasoning messages land in the session. Completed runs are archived as <code>aies-cycle-thoughts</code> entries.
        </div>
        ${items.length === 0
          ? html`<div class="empty">No thought blocks captured for the selected session yet.</div>`
          : html`<ul class="thought-list">${items.map((item) => this.renderThoughtItem(item))}</ul>`}
      </section>
    `;
  }

  private renderTimeline(events: OperatorTimelineEvent[]): TemplateResult {
    const items = this.timelineItems(events);
    const subsystems = Array.from(new Set(events.map((event) => event.subsystem))).sort();
    return html`
      <section class="card stack">
        <div class="row wrap">
          <h2>Unified Timeline</h2>
          <div class="timeline-meta">${items.length} visible / ${events.length} total</div>
        </div>
        <div class="filter-row">
          <select @change=${(event: Event) => { this.timelineSubsystemFilter = (event.target as HTMLSelectElement).value; }}>
            <option value="all">All subsystems</option>
            ${subsystems.map((subsystem) => html`<option value=${subsystem}>${subsystem}</option>`)}
          </select>
          <select @change=${(event: Event) => { this.timelineOriginFilter = (event.target as HTMLSelectElement).value; }}>
            <option value="all">All origins</option>
            <option value="system">system</option>
            <option value="operator">operator</option>
          </select>
          <input
            type="text"
            placeholder="Filter by change id"
            .value=${this.timelineChangeFilter}
            @input=${(event: Event) => { this.timelineChangeFilter = (event.target as HTMLInputElement).value; }}
          />
        </div>
        ${items.length === 0
          ? html`<div class="empty">No timeline events match the current filter.</div>`
          : html`<ul class="timeline-list">${items.map((item) => this.renderTimelineItem(item))}</ul>`}
      </section>
    `;
  }

  private renderLive(state: OperatorStateResponse): TemplateResult {
    return html`
      <div class="content">
        <div class="live-layout">
          <div class="center-column">
            ${this.renderControls(state)}
            ${this.renderThoughtStream(state.thoughtStream)}
            <section class="card stack">
              <div class="row wrap">
                <h2>Messages</h2>
                <div class="timeline-meta">${state.transcript.length} messages</div>
              </div>
              ${state.transcript.length === 0
                ? html`<div class="empty">No user/assistant messages in the selected session yet.</div>`
                : html`<ul class="transcript-list">${state.transcript.slice().reverse().map((message) => this.renderTranscriptItem(message))}</ul>`}
            </section>
            ${this.renderTimeline(state.timeline)}
          </div>
          <div class="rail-column">
            ${Object.values(state.panels).filter((panel) => panel.id !== "requests").map((panel) => this.renderPanel(panel))}
            <section class="card stack">
              <div class="row wrap">
                <h2>Requests</h2>
                <div class="timeline-meta">${state.requests.filter((item) => item.status === "open" || item.status === "approved").length} open/pending</div>
              </div>
              ${state.requests.length === 0 ? html`<div class="empty">No agent-to-user requests recorded.</div>` : html`<ul class="action-list">${state.requests.map((item) => this.renderRequestItem(item))}</ul>`}
            </section>
            <section class="card stack">
              <div class="row wrap">
                <h2>Operator Actions</h2>
                <div class="timeline-meta">${state.actionQueue.length} queued/logged</div>
              </div>
              <form class="stack" @submit=${(event: Event) => void this.addAction(event)}>
                <div class="field">
                  <label>Manual note / action</label>
                  <input .value=${this.actionSummaryDraft} @input=${(event: Event) => { this.actionSummaryDraft = (event.target as HTMLInputElement).value; }} />
                </div>
                <div class="field">
                  <label>Context note</label>
                  <textarea .value=${this.actionNoteDraft} @input=${(event: Event) => { this.actionNoteDraft = (event.target as HTMLTextAreaElement).value; }}></textarea>
                </div>
                <div class="button-row">
                  <button class="button" type="submit">Add Action</button>
                </div>
              </form>
              ${state.actionQueue.length === 0
                ? html`<div class="empty">No actions or follow-up debt.</div>`
                : html`<ul class="action-list">${state.actionQueue.map((item) => this.renderActionItem(item))}</ul>`}
            </section>
          </div>
        </div>
      </div>
    `;
  }

  private renderHistory(state: OperatorStateResponse): TemplateResult {
    const observatory = state.observatory;
    const openActions = state.actionQueue.filter((item) => item.status === "open").length;
    const verificationDebt = observatory.verificationStats.find((item) => item.result === "not_run")?.count ?? 0;
    const recoveryDebt = observatory.recoveryStats.find((item) => item.status === "open")?.count ?? 0;
    const openRequests = observatory.requestStats.find((item) => item.status === "open")?.count ?? 0;
    const orchestratedLoops = observatory.auditLoopReports.filter((item) => item.orchestrationSource === "cycle_runner").length;
    return html`
      <div class="content stack">
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">Recent Cycles</div>
            <div class="metric-value">${observatory.recentCycles.length}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Open Actions</div>
            <div class="metric-value">${openActions}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Verification Debt</div>
            <div class="metric-value">${verificationDebt}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Recovery Debt</div>
            <div class="metric-value">${recoveryDebt}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Open Requests</div>
            <div class="metric-value">${openRequests}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Memory Highlights</div>
            <div class="metric-value">${observatory.memoryHighlights.length}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Audit Loops</div>
            <div class="metric-value">${observatory.auditLoopReports.length}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Orchestrated Loops</div>
            <div class="metric-value">${orchestratedLoops}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Thought Archives</div>
            <div class="metric-value">${observatory.cycleThoughtArchives.length}</div>
          </div>
        </div>
        <div class="history-grid">
          <section class="card stack">
            <h2>Recent Cycles</h2>
            <div class="history-list">
              ${observatory.recentCycles.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${safeString(item.cycleId) || "cycle"}</strong>
                    <div class="artifact-meta">${formatTimestamp(safeString(item.createdAt))}</div>
                  </div>
                  <div>${safeString(item.summary) || "no summary"}</div>
                  <div class="artifact-meta">
                    focus=${safeString(item.focusType) || "none"} · verification=${safeString(item.verificationMode) || "n/a"}/${safeString(item.verificationResult) || "n/a"}
                  </div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Evaluation Trends</h2>
            <div class="history-list">
              ${observatory.evaluationTrends.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.dimension}</strong>
                    <span class="chip">${item.averageScore ?? "n/a"}</span>
                  </div>
                  <div class="artifact-meta">${item.observations} observations</div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Verification Stats</h2>
            <div class="history-list">
              ${observatory.verificationStats.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.result}</strong>
                    <span class="chip">${item.count}</span>
                  </div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Recovery Stats</h2>
            <div class="history-list">
              ${observatory.recoveryStats.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.status}</strong>
                    <span class="chip">${item.count}</span>
                  </div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Audit Loop Reports</h2>
            <div class="history-list">
              ${observatory.auditLoopReports.length === 0
                ? html`<div class="empty">No durable audit loop reports yet.</div>`
                : observatory.auditLoopReports.map((item) => html`
                    <div class="artifact-item">
                      <div class="row wrap">
                        <strong>${item.loopId}</strong>
                        <div class="pill-summary">
                          <span class="chip">${item.orchestrationSource}</span>
                          <span class="chip">${item.verificationMode}/${item.verificationResult}</span>
                        </div>
                      </div>
                      <div>${item.summary}</div>
                      <div class="artifact-meta">
                        change=${item.relatedChangeId ?? "none"} · cycle=${item.relatedCycleId ?? "none"} · generated=${formatTimestamp(item.generatedAt)}
                      </div>
                      <div class="artifact-meta">${item.path}</div>
                    </div>
                  `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Cycle-run Audit Trails</h2>
            <div class="history-list">
              ${observatory.cycleRunAudits.length === 0
                ? html`<div class="empty">No cross-session post-run audit trails recorded yet.</div>`
                : observatory.cycleRunAudits.map((item) => html`
                    <div class="artifact-item">
                      <div class="row wrap">
                        <strong>${item.runId}</strong>
                        <div class="pill-summary">
                          <span class="chip">${item.auditStatus}</span>
                          <span class="chip">${item.auditVerification}</span>
                          ${item.guidanceOutcomeStatus !== "none"
                            ? html`<span class="chip">guidance:${item.guidanceOutcomeStatus}</span>`
                            : nothing}
                          ${item.guidanceEffectivenessVerdict
                            ? html`<span class="chip">effect:${item.guidanceEffectivenessVerdict}</span>`
                            : nothing}
                        </div>
                      </div>
                      <div>${item.promptSummary}</div>
                      <div class="artifact-meta">
                        session=${item.sessionLabel} · source=${item.triggerSource} · status=${item.status} · finished=${formatTimestamp(item.finishedAt ?? item.startedAt)}
                      </div>
                      <div class="artifact-meta">
                        change=${item.relatedChangeId ?? "none"} · cycle=${item.relatedCycleId ?? "none"} · loop=${item.loopId ?? "none"}
                      </div>
                      <div class="artifact-meta">
                        auditReport=${item.loopReportPath ?? "none"} · durable=${item.hasDurableLoopReport ? "yes" : "no"}
                      </div>
                      <div class="artifact-meta">
                        guidanceReport=${item.guidanceOutcomeReportPath ?? "none"} · durable=${item.hasDurableGuidanceOutcomeReport ? "yes" : "no"}
                      </div>
                      <div class="artifact-meta">
                        effectReport=${item.guidanceEffectivenessReportPath ?? "none"} · durable=${item.hasDurableGuidanceEffectivenessReport ? "yes" : "no"}
                      </div>
                      <div class="artifact-meta">${item.guidanceOutcomeSummary}</div>
                      <div class="artifact-meta">${item.guidanceEffectivenessSummary}</div>
                      <div class="artifact-meta">${item.auditFailure ?? item.auditSummary}</div>
                    </div>
                  `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Memory Highlights</h2>
            <div class="history-list">
              ${observatory.memoryHighlights.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.title}</strong>
                    <span class="chip">${item.kind}</span>
                  </div>
                  <div class="artifact-meta">${formatTimestamp(item.createdAt)}</div>
                  <div class="artifact-meta">${item.path}</div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Archived Cycle Thoughts</h2>
            <div class="history-list">
              ${observatory.cycleThoughtArchives.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.runId ?? item.cycleId ?? "cycle-run"}</strong>
                    <span class="chip">${item.blockCount} blocks</span>
                  </div>
                  <div>${item.preview ?? "No thought preview captured."}</div>
                  <div class="artifact-meta">
                    cycle=${item.cycleId ?? "none"} · change=${item.relatedChangeId ?? "none"} · finished=${formatTimestamp(item.finishedAt ?? item.startedAt)}
                  </div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>OpenSpec Changes</h2>
            <div class="history-list">
              ${observatory.openspecChanges.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.changeId}</strong>
                    <span class="chip">${item.status}</span>
                  </div>
                  <div>${item.title}</div>
                  <div class="artifact-meta">${formatTimestamp(item.updatedAt)}</div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Request Stats</h2>
            <div class="history-list">
              ${observatory.requestStats.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.status}</strong>
                    <div class="artifact-meta">${item.count}</div>
                  </div>
                </div>
              `)}
            </div>
          </section>
          <section class="card stack">
            <h2>Provider Usage</h2>
            <div class="history-list">
              ${observatory.providerUsage.map((item) => html`
                <div class="artifact-item">
                  <div class="row wrap">
                    <strong>${item.provider}/${item.model}</strong>
                    <span class="chip">${item.count}</span>
                  </div>
                </div>
              `)}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  render(): TemplateResult {
    return this.withState((state) => html`
      <div class="app-shell">
        <header class="topbar">
          <div class="stack">
            <h1>AIES Operator Transparency</h1>
            <div class="topbar-meta">
              <span>Generated: ${formatTimestamp(state.generatedAt)}</span>
              <span>Session: ${state.activeSessionPath ?? "latest"}</span>
            </div>
          </div>
          <div class="status-pill-row">
            <span class="chip info">policy:${state.controls.policy.mode}</span>
            <span class="chip info">provider:${state.controls.provider.provider}</span>
            <span class="chip info">model:${state.controls.provider.model}</span>
            <span class="chip info">verify:${state.controls.verification.mode}</span>
            <span class=${badgeClassForSeverity(state.actionQueue.some((item) => item.status === "open") ? "warning" : "success")}>
              actions:${state.actionQueue.filter((item) => item.status === "open").length}
            </span>
          </div>
        </header>
        <nav class="tab-row">
          <button class=${this.activeTab === "live" ? "tab active" : "tab"} @click=${() => { this.activeTab = "live"; }}>
            Live Operator
          </button>
          <button class=${this.activeTab === "history" ? "tab active" : "tab"} @click=${() => { this.activeTab = "history"; }}>
            Observatory / History
          </button>
        </nav>
        ${this.activeTab === "live" ? this.renderLive(state) : this.renderHistory(state)}
      </div>
    `);
  }
}

customElements.define("aies-operator-app", AiesOperatorApp);

const mount = document.getElementById("app");
if (mount) {
  mount.replaceWith(document.createElement("aies-operator-app"));
}
