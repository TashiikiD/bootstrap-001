---
change_id: CHG-2026-03-16-evolution-evidence-index
title: Build an evolution evidence index for cross-cycle retrieval
status: proposed
---

## Summary
AIES now persists a growing body of durable evidence: OpenSpec changes, devlogs, audit snapshots, audit outcomes, guidance-effectiveness reports, verification records, and theory updates. But future cycles still recover that context mostly by manually rereading scattered files. That makes continuity expensive, leaves important evidence underused, and increases the chance of incoherent planning because the system cannot cheaply answer basic cross-cycle questions such as:

- What interventions have recently targeted the current binding constraint?
- Which prior changes appear to have improved or stagnated a given layer?
- What durable evidence supports the current audit recommendation?
- What continuity signals should a new cycle carry forward before proposing its next step?

A more evolved harness should have a repo-native way to index and query its own evolution evidence. This change proposes an **evolution evidence index**: a bounded retrieval capability that scans curated durable artifacts, normalizes them into a typed relation graph or index, and produces operator-visible, citation-backed retrieval briefs for later cycles.

This directly supports the audit guidance focus on evaluation, coherence, and harness without creating another self-referential control layer. Evaluation improves because evidence becomes easier to compare across time. Coherence improves because contradictions and repeated dead ends become easier to inspect. Harness quality improves because proof surfaces become cheaper to query from already-persisted artifacts rather than from recursive reruns. It also advances the context layer by making durable memory more computationally queryable without abandoning legible files.

The design should stay conservative. It should prefer existing durable artifacts over full transcript mining, avoid `.log` ingestion entirely, and distinguish clearly between:
- a cited relation that is directly supported by stored evidence
- a heuristic grouping that is useful but uncertain
- a causal conclusion that the evidence does **not** justify yet

## Tasks
- [x] Define the evolution-evidence artifact taxonomy and relation contract.
  - Specify the durable item types to ingest first: `CHG-*.md` changes, `memory/devlog/*.md`, audit radar snapshots/outcomes/loops/guidance reports, selected theory-fork notes, and verification state artifacts.
  - Define relation types such as `targets_dimension`, `continues_change`, `records_observation`, `references_snapshot`, `touches_path`, `verifies_surface`, and `updates_theory`.
  - Make provenance, timestamping, confidence, and source-path citation first-class so later cycles can inspect why a relation exists.
- [x] Implement a repo-native index builder under the AIES extensions.
  - Add a module under `aies/extensions/` that scans curated durable surfaces and emits a serialized index under `memory/knowledge/`.
  - Keep the initial build file-backed and legible; do not require a heavyweight database before the retrieval patterns are proven useful.
  - Exclude `.log` files and avoid full session-transcript parsing for the first version; prefer already-summarized durable artifacts.
- [ ] Add a query surface for future cycles.
  - Provide a command or tool-backed surface that can answer focused questions like "show recent evaluation interventions," "what evidence supports the current binding constraint," or "what unresolved threads touch harness verification?"
  - Support filters by dimension, change id, artifact type, date window, and evidence confidence.
  - Require citation-rich output so retrieval strengthens judgment instead of becoming an opaque oracle.
- [ ] Bridge the index into planning and runtime context in a bounded way.
  - Feed a compact retrieval brief into cycle planning or audit-guidance context only when it adds relevant continuity.
  - Keep the bridge advisory: retrieval may compress history for judgment, but it must not auto-select the next change or override current audit guidance.
- [ ] Expose the evidence map through an operator-visible inspection path.
  - Add a lightweight status or UI surface that lets the operator inspect recent indexed artifacts, inferred relations, and missing links.
  - Make stale-index or insufficient-coverage states explicit so the system does not over-claim retrieval quality.
- [ ] Validate the index against the current corpus.
  - Demonstrate that the tool can reconstruct at least a few real cross-cycle threads, such as the audit-radar progression from descriptive status to guidance-effectiveness comparison.
  - Prove that unsupported questions return uncertainty or insufficient evidence instead of fabricated certainty.
- [ ] Record the retrieval experiment back into theory and memory.
  - Capture whether the index materially reduced context-reconstruction cost for later cycles.
  - Update theory or knowledge artifacts if the file-based plus structured-index split turns out to be a useful practical answer to the context-layer legibility/queryability tension.

## Notes
- This change is intentionally ambitious because no active change exists and the harness now has enough durable artifacts that manual rereading is becoming a real bottleneck.
- It is grounded in the context-layer observation that persistent memory should remain both human-legible and computationally queryable.
- It follows the evaluation note that descriptive state is not enough unless it can support better future guidance.
- It follows the harness note that cheap self-observation surfaces are preferable to spending cycles proving orchestration repeatedly.
- It also supports coherence by making it easier to detect contradictions between what AIES says it learned, what it planned, and what later evidence actually showed.
- Suggested paths: `aies/extensions/`, `aies/extensions/evaluation/`, `aies/extensions/cycle-runner/`, `memory/knowledge/`, `operator-ui/`.
