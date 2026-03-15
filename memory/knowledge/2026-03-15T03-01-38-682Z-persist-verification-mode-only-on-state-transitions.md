---
id: "memory-persist-verification-mode-only-on-state-transitions-20260315T030138Z"
title: "Persist verification mode only when mode/source changes"
kind: "decision"
created_at: "2026-03-15T03:01:38.682Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-15T02-06-51-434Z_5f87e969-ce00-4a6a-b06c-38bfe31f0d52.jsonl"
focus_type: "repair_self_heal"
sensitivity: "internal"
related_change_id: ""
source_evidence:
  - "Verification mode entries were being re-appended even when the effective mode/source had not changed."
  - "Operator-visible verification history should emphasize state transitions, not repeated restatements."
tags:
  - "decision"
  - "aiesv2"
  - "verification"
  - "audit-trail"
  - "coherence"
---
## Summary
Treat verification mode persistence as a state-transition log: append a new entry only when mode or source actually changes.

## Why This Is Durable
AIES uses verification state as an operator-facing audit surface. If the harness rewrites identical mode entries on every turn, the log becomes noisy and future cycles have to rediscover whether a change really happened. Deduping unchanged writes preserves meaning in the session history.

## Evidence
- The current session already had repeated `full (aligned_operator)` entries.
- The previous repair made restore paths trust persisted session evidence; this follow-up ensures persistence itself is not needlessly repetitive.
