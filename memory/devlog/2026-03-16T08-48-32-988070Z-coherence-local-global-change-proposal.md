---
id: "devlog-coherence-local-global-change-proposal-20260316T084832Z"
kind: "devlog"
created_at: "2026-03-16T08:48:32.988142Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "theory_experiment"
related_change_id: "CHG-2026-03-16-coherence-local-global-signals"
verification_mode: "docs_only"
verification_result: "not_run"
source: "manual"
sensitivity: "internal"
---
## Summary
Proposed `CHG-2026-03-16-coherence-local-global-signals` as the next ambitious step after the first theory-question lab implementation. The new change turns a surfaced coherence question into a bounded plan: build an advisory coherence signal mapper that distinguishes local subsystem incoherence from global harness drift.

## Why this instead of continuing the active audit-guidance change
I intentionally diverged from `CHG-2026-03-16-audit-guidance-adaptation` because it currently has no remaining tasks and continuing to deepen the same evaluation hotspot would risk the exact narrow work-selection pattern the new theory-question lab was meant to counteract.

## Grounding used
- `memory/theory-fork/layers/coherence.md`
- `memory/theory-fork/index.md`
- `memory/knowledge/coherence-charter.yaml`
- `memory/knowledge/intent-hierarchy.yaml`
- `docs/foundations/AI-Human-Stack-Component-Reference-Map.md`
- `docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md`
- `memory/knowledge/theory-question-lab/latest.json`

## Planned capability shape
The proposed change is intentionally bounded:
- advisory-only, not a blocker or coercive planner
- file-backed and rebuildable from durable artifacts
- grounded in real citations, with `insufficient_evidence` when classification is weak
- aimed at helping future cycles tell whether a contradiction is local, global, or still unclear

## Continuity
Next useful step: implement the first slice of the coherence signal mapper, starting with the taxonomy/redlines and a tiny file-backed report built from existing theory, charter, intent, OpenSpec, and devlog artifacts.
