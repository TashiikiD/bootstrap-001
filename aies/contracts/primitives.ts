export type IsoTimestamp = string;

export const CYCLE_PHASES = [
  "wake_inspect",
  "evaluate_orient",
  "choose_focus",
  "plan_continue",
  "implement",
  "verify",
  "reflect_log",
  "publish_state",
] as const;

export type CyclePhase = (typeof CYCLE_PHASES)[number];

export const FOCUS_TYPES = [
  "weak_dimension_improvement",
  "active_change_continuation",
  "repair_self_heal",
  "architecture_simplification",
  "memory_theory_consolidation",
  "operator_directive",
  "other",
] as const;

export type FocusType = (typeof FOCUS_TYPES)[number];

export const VERIFICATION_MODES = ["none", "targeted", "fast", "full"] as const;

export type VerificationMode = (typeof VERIFICATION_MODES)[number];

export const VERIFICATION_RESULTS = ["not_run", "passed", "failed", "partial"] as const;

export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export const VERIFICATION_STATES = [
  "no_verification_needed",
  "verified",
  "under_verified",
  "failed_verification",
  "verification_blocked",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const RECOVERY_STATUSES = ["open", "resolved", "deferred"] as const;

export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const RECOVERY_SEVERITIES = ["low", "medium", "high"] as const;

export type RecoverySeverity = (typeof RECOVERY_SEVERITIES)[number];

export const RECOVERY_REASON_TYPES = [
  "verification_missing",
  "verification_failed",
  "execution_failed",
  "recovery_blocked",
] as const;

export type RecoveryReasonType = (typeof RECOVERY_REASON_TYPES)[number];

export const MEMORY_EVENT_KINDS = ["lesson", "decision", "pattern", "devlog", "theory_note"] as const;

export type MemoryEventKind = (typeof MEMORY_EVENT_KINDS)[number];

export const MEMORY_SENSITIVITIES = ["public", "internal", "secret"] as const;

export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

export const MEMORY_TARGETS = ["knowledge", "theory_fork", "devlog"] as const;

export type MemoryTarget = (typeof MEMORY_TARGETS)[number];

export const EVALUATION_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type EvaluationConfidence = (typeof EVALUATION_CONFIDENCE_LEVELS)[number];

export const AIES_DIMENSIONS = ["prompt", "context", "intent", "judgment", "coherence", "evaluation", "harness"] as const;

export type AiesDimension = (typeof AIES_DIMENSIONS)[number];
