---
change_id: CHG-2026-03-16-theory-question-lab
title: Build a theory-question lab for experiment-driven evolution
status: proposed
---

## Summary
AIES now has a growing theory fork with explicit open questions across prompt, context, intent, judgment, coherence, evaluation, and harness. But those questions still live mostly as passive prose. Future cycles can reread them, yet they still tend to gravitate back toward the same already-instrumented surfaces because the harness lacks a repo-native way to turn theory uncertainty into bounded experiment candidates.

That is an evolution bottleneck. A more capable version of AIES should not only store open questions — it should be able to surface which questions are ready for experimentation, what kind of build or probe could answer them, what code surfaces are implicated, and what minimum verification floor the experiment would require. This is not a planner that chooses the next cycle automatically. It is a theory-to-experiment bridge that helps future judgment pick more ambitious, more varied, and more theory-grounded work.

This change proposes a **theory-question lab**: a bounded capability that scans the theory fork for open questions, normalizes them into typed candidate experiments, and exposes operator-visible, citation-backed experiment briefs. The output should remain advisory. It should help AIES escape local code-hotspot gravity without replacing human or runtime judgment.

This directly advances neglected layers that have had less practical tooling than evaluation and context:
- **prompt** by making self-authored prompt questions discoverable as experiment seeds
- **intent** by connecting the intent hierarchy to concrete experiments instead of only retrospective interpretation
- **judgment** by making uncertainty and required verification more explicit before implementation starts
- **coherence** by showing where theory claims remain unresolved or where multiple questions point at the same architectural gap

## Tasks
- [x] Define the theory-question artifact schema and redlines.
  - Specify what gets extracted first from `memory/theory-fork/`: source layer/meta section, exact question text, timestamps when available, related dimensions, candidate experiment shapes, and cited source paths.
  - Make the redline explicit: the lab may suggest experiments, but it must not auto-select the next change, auto-score theory quality by question count, or turn theory maintenance into a coercive planner.
- [x] Implement a repo-native theory-question scanner.
  - Add a module under `aies/extensions/` that parses the theory-fork `Open Questions` sections and emits a serialized, legible artifact under `memory/knowledge/`.
  - Keep the first version file-backed and rebuildable from authored theory files.
  - Prefer deterministic extraction over speculative summarization.
- [x] Add a bounded experiment-candidate synthesizer.
  - Generate compact candidate briefs such as: what question is being probed, why it matters now, suggested repo surfaces, likely experiment shape (tool, skill, runtime module, OpenSpec plan), expected risk, and minimum verification floor.
  - Include simple heuristics for breadth, such as highlighting neglected layers or repeated concentration on one subsystem, without turning those heuristics into mandatory policy.
- [x] Expose the lab through an operator-visible and cycle-usable surface.
  - Add a lightweight server/UI or runtime inspection path that lets the operator and future cycles browse candidate experiments with citations.
  - Optionally allow a bounded retrieval brief for cycle planning, but keep it advisory and suppress it when it adds no useful signal.
- [x] Validate the lab against the current theory corpus.
  - Demonstrate that it can recover real questions from multiple layers, including at least one non-evaluation candidate.
  - Prove that ambiguous or underspecified questions stay visibly ambiguous instead of being over-specified into fake certainty.
- [x] Use the lab to launch one real experiment-backed change or theory update.
  - Pick one surfaced candidate and either implement a first slice or record why it was deferred.
  - Capture whether the lab actually broadened AIES work selection beyond existing code hotspots.

## Notes
- This change is intentionally a rotation away from the current evaluation-heavy work. The audit-radar line produced real value, but repeated cycles on the same system now risk narrowing evolution around what is easiest to measure.
- It follows the intent-layer observation that metrics and priorities encode values whether or not those values are made explicit.
- It follows the coherence-layer observation that unresolved contradictions and repeated local fixes need explicit mechanisms before they compound.
- It also supports the AGENTS guidance that theory should develop through experimentation, not just through more prose.
- Suggested paths: `memory/theory-fork/`, `aies/extensions/`, `memory/knowledge/`, `operator-ui/`.
