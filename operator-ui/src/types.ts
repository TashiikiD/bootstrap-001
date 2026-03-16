export interface ProvenanceInfo {
  sourceType: "inferred" | "recorded" | "file-backed" | "operator-override" | "runtime";
  sourceLabel: string;
  sourceTimestamp: string | null;
  relatedCycleId: string | null;
  relatedChangeId: string | null;
  stale: boolean;
}

export interface PanelState {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
  detail: Record<string, unknown>;
  provenance: ProvenanceInfo;
}

export interface TranscriptMessage {
  id: string;
  role: string;
  text: string;
  timestamp: string;
  provider?: string | null;
  model?: string | null;
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

export interface SessionSummary {
  path: string;
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  lastModified: string;
  messageCount: number;
}

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

export interface TriggerAudit {
  pending: boolean;
  status: "idle" | "launching" | "launched" | "skipped" | "failed";
  message: string | null;
  targetSessionPath: string | null;
  requestedAt: string | null;
  lastTriggerAt: string | null;
  lastTriggerKind: "manual" | "cadence" | "continuous" | null;
  lastLaunchPid: number | null;
  lastWatchWindowPid: number | null;
  lastSkippedAt: string | null;
  lastSkippedReason: string | null;
  activeCycleId: string | null;
  activeCyclePhase: string | null;
}

export interface ObservatoryData {
  recentCycles: Array<Record<string, unknown>>;
  evaluationTrends: Array<{ dimension: string; observations: number; averageScore: number | null }>;
  verificationStats: Array<{ result: string; count: number }>;
  recoveryStats: Array<{ status: string; count: number }>;
  memoryHighlights: Array<{ path: string; title: string; kind: string; createdAt: string }>;
  openspecChanges: Array<{ changeId: string; title: string; status: string; updatedAt: string | null }>;
  providerUsage: Array<{ provider: string; model: string; count: number }>;
  auditLoopReports: Array<{ loopId: string; generatedAt: string; orchestrationSource: string; verificationMode: string; verificationResult: string; relatedCycleId: string | null; relatedChangeId: string | null; path: string; summary: string }>;
  guidanceOutcomeReports: Array<{ reportId: string; generatedAt: string; alignmentStatus: string; relatedCycleId: string | null; relatedChangeId: string | null; summary: string; path: string }>;
  guidanceEffectivenessReports: Array<{ reportId: string; generatedAt: string; guidanceOutcomeCount: number; analyzedCount: number; linkedPostRunAuditCount: number; dominantVerdict: string; summary: string; path: string }>;
  guidanceAdaptationReports: Array<{ reportId: string; generatedAt: string; status: string; summary: string; note: string; recommendedAdjustment: string; missingThresholds: string[]; path: string }>;
  cycleRunAudits: Array<{ runId: string; sessionPath: string; sessionLabel: string; startedAt: string | null; finishedAt: string | null; status: string; triggerSource: string; promptSummary: string; relatedCycleId: string | null; relatedChangeId: string | null; auditStatus: string; auditVerification: string; loopId: string | null; loopReportPath: string | null; hasDurableLoopReport: boolean; auditSummary: string; auditFailure: string | null; guidanceOutcomeStatus: string; guidanceOutcomeSummary: string; guidanceOutcomeReportPath: string | null; hasDurableGuidanceOutcomeReport: boolean; guidanceEffectivenessVerdict: string | null; guidanceEffectivenessSummary: string; guidanceEffectivenessReportPath: string | null; hasDurableGuidanceEffectivenessReport: boolean; guidanceAdaptationStatus: string | null; guidanceAdaptationNote: string; guidanceAdaptationReportPath: string | null; hasDurableGuidanceAdaptationReport: boolean }>;
  cycleThoughtArchives: Array<{ runId: string | null; cycleId: string | null; relatedChangeId: string | null; startedAt: string | null; finishedAt: string | null; blockCount: number; preview: string | null }>;
  requestStats: Array<{ status: string; count: number }>;
}

export interface OperatorStateResponse {
  generatedAt: string;
  activeSessionPath: string | null;
  sessions: SessionSummary[];
  controls: ControlState;
  triggerAudit: TriggerAudit;
  transcript: TranscriptMessage[];
  thoughtStream: ThoughtStreamItem[];
  panels: Record<string, PanelState>;
  timeline: OperatorTimelineEvent[];
  actionQueue: OperatorActionItem[];
  requests: OperatorRequestItem[];
  observatory: ObservatoryData;
}
