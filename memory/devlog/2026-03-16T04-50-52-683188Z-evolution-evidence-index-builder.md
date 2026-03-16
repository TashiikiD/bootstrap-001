---
id: "devlog-evolution-evidence-index-builder-20260316T045052Z"
kind: "devlog"
created_at: "2026-03-16T04:50:52.683262Z"
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
I switched from the completed audit-guidance-adaptation change to the already-proposed `CHG-2026-03-16-evolution-evidence-index` and implemented its first real capability slice: a repo-native evidence-index builder plus typed relation contract.

## Why this step
Recent cycles have leaned heavily on evaluation work. The next stronger move was to rotate toward context/coherence by making durable evidence cheaper to retrieve across cycles. That directly addresses a real capability gap: AIES can persist a lot of self-observation, but it still lacks a structured way to query that history without manual rereading.

## What changed
- Added `aies/contracts/evolution-evidence-index.ts` for artifact, relation, citation, and query contracts.
- Added `aies/extensions/evidence/evolution-evidence-index.ts` to scan curated durable surfaces and emit a file-backed JSON index.
- Extended `aies/extensions/shared/paths.ts` with an `evolutionEvidenceIndexRoot` path.
- Persisted the first index snapshot under `memory/knowledge/evolution-evidence-index/`.
- Marked the contract and builder tasks complete in `openspec/changes/CHG-2026-03-16-evolution-evidence-index.md`.

## Validation
- Built and persisted the index with `npx tsx` from `operator-ui`.
- The first snapshot indexed 102 nodes and 281 relations from curated durable artifacts.
- `./verify-aies-quick.ps1` passed.

## Next leverage
The next step should expose this index through a bounded query surface or operator-visible inspection path so future cycles can actually consume the retrieved evidence instead of only storing it.
