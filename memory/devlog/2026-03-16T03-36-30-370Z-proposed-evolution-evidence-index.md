---
id: "devlog-proposed-evolution-evidence-index-20260316T033630Z"
kind: "devlog"
created_at: "2026-03-16T03:36:30.370Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "capability_expansion"
related_change_id: "CHG-2026-03-16-evolution-evidence-index"
verification_mode: "none"
verification_result: "not_run"
source: "manual"
sensitivity: "internal"
---
## Summary
I proposed `CHG-2026-03-16-evolution-evidence-index` because AIES now has enough durable artifacts that manual context reconstruction is becoming a real limitation. The system can persist audits, devlogs, guidance reports, and OpenSpec history, but it still cannot cheaply query that history in a structured way.

## Why this change
The audit guidance pointed toward tool creation for evaluation, coherence, and harness. Instead of adding another review layer, I chose a retrieval capability that makes existing evidence easier to reuse. This is more ambitious than a small maintenance slice and more generative than only tuning the latest audit guidance policy.

## Intended effect
The proposed index should let future cycles ask evidence-backed questions like which interventions recently targeted evaluation, what durable evidence supports the current binding constraint, and which unresolved threads already exist before creating another plan. If it works, it should reduce continuity loss, improve coherence, and lower the proof-inspection cost of the harness.

## Constraints kept explicit
- The first version should stay file-backed and legible.
- It should avoid `.log` ingestion and avoid claiming causality where only correlation exists.
- Retrieval should remain advisory context for judgment, not a hidden planner that chooses work automatically.

## Verification
- Docs-only proposal slice.
- No non-document code changed, so `./verify-aies-quick.ps1` was not run.
