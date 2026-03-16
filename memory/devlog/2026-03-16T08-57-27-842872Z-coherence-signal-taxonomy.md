---
id: "devlog-coherence-signal-taxonomy-20260316T085727Z"
kind: "devlog"
created_at: "2026-03-16T08:57:27.842921Z"
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
Completed the first task of `CHG-2026-03-16-coherence-local-global-signals` by defining the initial local/global coherence taxonomy, evidence thresholds, signal families, and redlines in a new durable knowledge document.

## What changed
- Added `memory/knowledge/coherence-signals/README.md`
- Marked task 1 complete in `openspec/changes/CHG-2026-03-16-coherence-local-global-signals.md`

## Key decisions
- Defined four classification outcomes: `local`, `global`, `ambiguous`, and `insufficient_evidence`
- Required explicit citation floors so the future mapper does not over-classify weak patterns
- Scoped the first implementation to a small advisory signal family set: hotspot concentration, theory/runtime mismatch, intent/action misalignment, and cross-session contradiction
- Re-stated the redline that coherence reporting must stay advisory and must not become an auto-blocking or auto-planning layer

## Why this matters
This gives future implementation work a shared concept of what the mapper is allowed to claim. It also sharpens the single-agent coherence question from the theory fork into a bounded operational experiment instead of leaving it as prose.

## Continuity
Next useful step: implement a tiny file-backed coherence report builder that can emit at least one `insufficient_evidence` result honestly from the current artifact corpus before adding any operator surface.
