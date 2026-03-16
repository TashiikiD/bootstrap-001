---
id: "devlog-cycle-preview-guidance-preflight-20260316T054528Z"
kind: "devlog"
created_at: "2026-03-16T05:45:28.351737Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "capability_expansion"
related_change_id: "CHG-2026-03-16-audit-guidance-adaptation"
verification_mode: "fast"
verification_result: "passed"
source: "manual"
sensitivity: "internal"
---
## Summary
I continued `CHG-2026-03-16-audit-guidance-adaptation` by adding a cheap preflight inspection tool instead of another review layer. The new cycle-preview command exposes the synthesized next-cycle context packet — including guidance trust and evidence anchors — without having to launch a run.

## Why this step
The active change was already functionally implemented, but future cycles still lacked an easy way to inspect the full guidance packet before execution. The evaluation theory says evaluation should terminate in guidance, and the harness theory says self-observation should be cheap when possible. A preview command satisfies both: it makes the advisory guidance/evidence context inspectable without inventing a coercive planner or paying the cost of another orchestration pass.

## What changed
- Added `/cycle-preview` to the shared command surface.
- Extended `aies/extensions/cycle-runner/index.ts` with:
  - preview-argument parsing (`--full`)
  - a bounded synthesized prompt preview formatter
  - a live preflight report that shows
    - next cycle summary
    - related change
    - audit guidance summary and trust annotation
    - evolution evidence summary and uncertainty
    - live verification/recovery surfaces
    - a bounded prompt preview, with optional full prompt output

## Validation
- `pwsh -File ./verify-aies-quick.ps1` passed.

## Result
AIES now has a cheap, operator-visible and agent-usable way to inspect the exact guidance packet that would steer the next cycle. This strengthens evaluation-to-judgment handoff while keeping the guidance surface advisory.
