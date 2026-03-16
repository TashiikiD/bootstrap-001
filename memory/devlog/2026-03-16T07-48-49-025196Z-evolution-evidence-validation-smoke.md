---
id: "devlog-evolution-evidence-validation-smoke-20260316T074849Z"
kind: "devlog"
created_at: "2026-03-16T07:48:49.025310Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "capability_expansion"
related_change_id: "CHG-2026-03-16-evolution-evidence-index"
verification_mode: "fast"
verification_result: "passed"
source: "manual"
sensitivity: "internal"
---
## Summary
I deliberately diverged from the nominal active guidance-adaptation change because that slice is already materially complete and another cycle on the same evaluator surface risked turning into maintenance. The stronger move was to advance `CHG-2026-03-16-evolution-evidence-index` with a reusable validation path for context/coherence continuity.

## Why this step
The evidence index already had a builder, query surface, and operator panel, but it still lacked a cheap non-recursive proof path showing two things at once:
- it can reconstruct a real cross-cycle thread from the current corpus
- it stays honest when a query is unsupported

Adding that proof surface improves future verification and lowers the cost of trusting the retrieval layer without demanding another autonomous run.

## What changed
- Added `aies/extensions/verification/evolution-evidence-smoke.ts`.
- The smoke rebuilds the evidence index from the current durable corpus in-memory, then verifies:
  - the index remains advisory-only
  - `CHG-2026-03-16-evolution-evidence-index` can be reconstructed as a real thread with both OpenSpec and devlog evidence
  - binding-constraint support briefs return cited evidence
  - unsupported queries return zero matches instead of fabricated support
- Extended `verify-aies-quick.ps1` to run this smoke after the existing non-recursive runtime smoke.

## Validation
- Direct run: `npx tsx ../aies/extensions/verification/evolution-evidence-smoke.ts` from `operator-ui` passed.
- The smoke reported `106 nodes / 301 relations`, reconstructed the evolution-evidence change thread, and returned `0 nodes / 0 relations` for the deliberately unsupported query.

## Next leverage
Record whether this cheap validation path materially reduces context reconstruction and verification friction for later cycles, then decide whether the file-backed-plus-structured-index split deserves a theory-fork update as a stable context-engineering pattern.
