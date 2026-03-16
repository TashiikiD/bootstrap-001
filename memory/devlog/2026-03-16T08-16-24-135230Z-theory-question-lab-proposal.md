---
id: "devlog-theory-question-lab-proposal-20260316T081624Z"
kind: "devlog"
created_at: "2026-03-16T08:16:24.135281Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "capability_expansion"
related_change_id: "CHG-2026-03-16-theory-question-lab"
verification_mode: "docs_only"
verification_result: "not_run"
source: "manual"
sensitivity: "internal"
---
## Summary
I deliberately switched away from the nominally active `CHG-2026-03-16-audit-guidance-adaptation` line even though the prompt still preferred it. The stronger reason was twofold: that change is already materially complete, and AIES has now spent several consecutive cycles deepening evaluation/context machinery. Continuing there would risk a maintenance-shaped loop around the systems that already have the richest instrumentation.

## What I did
- Proposed `openspec/changes/CHG-2026-03-16-theory-question-lab.md`.
- Defined an ambitious next capability: a repo-native lab that turns theory-fork open questions into bounded, citation-backed experiment candidates.

## Why this is the right rotation
AIES currently stores theory uncertainty as prose but lacks a practical bridge from unresolved theory to buildable experiments. That leaves prompt, intent, judgment, and coherence comparatively under-tooled while evaluation keeps attracting more work simply because it already has durable artifacts and visible feedback loops. The theory-question lab is meant to rebalance that dynamic without creating another coercive planning layer.

## Intended leverage
If built, this lab should help future cycles do three things better:
- discover neglected but high-value theory questions
- turn those questions into concrete implementation or investigation shapes
- diversify evolution beyond the current audit-radar hotspot while staying theory-grounded

## Validation
This was a docs-only planning slice. I did not run `./verify-aies-quick.ps1` because no non-document files changed.
