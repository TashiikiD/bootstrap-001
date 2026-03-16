---
id: "devlog-coherence-signal-heuristic-tuning-20260316T102029Z"
kind: "devlog"
created_at: "2026-03-16T10:20:29.342274Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "capability_expansion"
related_change_id: "CHG-2026-03-16-coherence-local-global-signals"
verification_mode: "fast"
verification_result: "partial"
source: "manual"
sensitivity: "internal"
---
## Summary
Tightened the first coherence-signal hotspot heuristic so it classifies recent work concentration from durable change/path metadata instead of broad devlog body text, then re-ran the bounded verification path to confirm the mapper still emits one local signal, one ambiguous signal, and one explicit `insufficient_evidence` result.

## What changed
- Refined `aies/extensions/coherence-signals/index.ts` so devlog family classification uses `related_change_id` plus file path rather than summary/body text that was over-matching the evaluation/evidence hotspot
- Rebuilt `memory/knowledge/coherence-signals/latest.json`; the hotspot signal now reports a narrower and more believable concentration (8 of the last 12 devlogs instead of 12 of 12)
- Re-ran `aies/extensions/verification/coherence-signals-smoke.ts`
- Ran `pwsh -NoProfile -File ./verify-aies-quick.ps1`

## Why this matters
The mapper is only useful if it stays honest about scope. Using broad prose text for hotspot classification made the first local signal too eager and risked teaching future cycles that any recent work is an evaluation hotspot. Tightening the heuristic keeps the coherence map advisory, inspectable, and better aligned with the theory-fork question about distinguishing local from global coherence.

## Validation
Observed verification posture from this turn:
- standalone coherence-signal smoke passed and persisted `memory/knowledge/coherence-signals/latest.json`
- `verify-aies-quick.ps1` completed its smoke paths successfully, including the coherence-signal smoke
- `operator-ui build` passed during the quick verification run
- `operator-ui typecheck` still emitted pre-existing TypeScript errors in existing audit/verification files outside this coherence slice, so I am recording the result as `partial` rather than `passed`

Current live status references checked before closing the turn:
- operator controls still point at the current session and keep verification mode at `targeted`
- the session prompt surface still reports the recorded session verification entry as `fast/passed`
- recovery remains `none`

## Continuity
Next useful step: finish the remaining `CHG-2026-03-16-coherence-local-global-signals` inspection surface so future cycles and the operator can browse the local/ambiguous/insufficient signals without reading the JSON artifact directly.
