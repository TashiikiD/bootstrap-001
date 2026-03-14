---
change_id: chg-aies-v2-bootstrap
title: AIES v2 Pi integration bootstrap
status: active
current_task_id: task-active-cycle-runner
pending_task_ids:
  - task-verification-recovery-edges
  - task-tighten-guided-autonomy
  - task-legacy-runtime-retirement
blocked: false
blocked_reasons: []
updated_at: 2026-03-13T19:15:00-07:00
priority: high
---

## Summary
Stand up AIES v2 as a modular Pi-based system while keeping continuity, memory, and operator transparency visible without recreating the brittle legacy harness.

## Current Task
Implement the first active cycle runner so AIES can launch one explicit self-evolution turn inside the current Pi session without timers, retries, or hidden session forks.

## Pending Tasks
- Harden verification and recovery edges around autonomous cycle runs.
- Tighten guidance only where runtime evidence justifies it.
- Retire the legacy runtime once Pi-based execution is the stable default.

## Blockers
None currently.

## Notes
Favor advisory continuity over hard routing. Active cycles should remain explicit, inspectable, and single-turn until cadence/scheduling is intentionally added later.
