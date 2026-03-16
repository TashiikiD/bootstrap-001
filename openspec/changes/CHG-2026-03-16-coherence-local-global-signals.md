---
change_id: CHG-2026-03-16-coherence-local-global-signals
title: Distinguish local and global coherence signals
status: proposed
generated_from_change: CHG-2026-03-16-theory-question-lab
generated_from_theory_question: "Is there a useful distinction between local coherence (within a single subsystem) and global coherence (across the entire architecture)?"
---

## Summary
The new theory-question lab surfaced a coherence-focused experiment candidate from `memory/theory-fork/layers/coherence.md`: **Is there a useful distinction between local coherence (within a single subsystem) and global coherence (across the entire architecture)?** That question matters because AIES now has several real coherence-adjacent artifacts — the coherence charter, the intent hierarchy, the theory fork, OpenSpec changes, devlogs, and the evolution evidence index — but it still lacks a shared way to say whether an observed problem is:

- a **local coherence** issue inside one subsystem or workflow
- a **global coherence** issue spanning theory, memory, planning, runtime, and operator-visible surfaces
- or still too weakly evidenced to classify honestly

The foundation reference says that for a single agent, coherence engineering is primarily **behavioral consistency across sessions** and **architectural integrity**. The audit protocol also says single-agent systems should be evaluated for coherence **across sessions rather than across agents**. Today AIES can describe those ideas, but it still cannot inspect them in a bounded, operator-visible way. That keeps coherence weak and makes it harder to tell whether repeated work on one hotspot reflects healthy iteration, local incoherence, or system-level drift.

This change proposes a bounded **coherence signal mapper**: a repo-native capability that scans durable artifacts and emits advisory, citation-backed local/global coherence signals. The goal is not to invent a new coercive score or blocker. The goal is to help future cycles answer a practical question before acting: *is the inconsistency I am seeing confined to one area, or is it evidence that the harness is drifting as a whole?*

This is a justified divergence from the still-active `CHG-2026-03-16-audit-guidance-adaptation` line because that evaluation-focused change has no remaining tasks, while the theory-question lab explicitly called for using a surfaced non-evaluation candidate to broaden actual work selection.

## Tasks
- [x] Define the local/global coherence taxonomy and redlines.
  - Specified what counts as a local coherence signal, a global coherence signal, and an ambiguous or insufficient-evidence case in `memory/knowledge/coherence-signals/README.md`.
  - Made the redline explicit: the mapper may surface coherence signals and contradictions, but it must not auto-block future work, auto-score overall coherence maturity, or replace human/judgment-layer tradeoffs.
- [x] Implement a repo-native coherence signal builder.
  - Added `aies/extensions/coherence-signals/index.ts` to scan durable authored surfaces such as `memory/knowledge/coherence-charter.yaml`, `memory/knowledge/intent-hierarchy.yaml`, theory-fork notes, the coherence OpenSpec change, and recent devlogs.
  - The builder now emits a rebuildable artifact at `memory/knowledge/coherence-signals/latest.json` so the signal map stays file-backed and inspectable.
- [x] Add bounded detection heuristics grounded in real data.
  - Added a small advisory heuristic set for subsystem hotspot concentration, intent/action tension, and theory/runtime mismatch using direct citations from the current corpus.
  - The mapper now emits `insufficient_evidence` plainly when the corpus does not justify a local/global classification.
- [ ] Expose the coherence map through a cycle-usable and operator-visible surface.
  - Add a lightweight inspection path so future cycles and the operator can browse surfaced signals, their scope (`local` or `global`), and the citations behind them.
  - Keep the surface advisory and suppress over-claiming when the map is stale or thin.
- [x] Validate the distinction against the current corpus.
  - Added `aies/extensions/verification/coherence-signals-smoke.ts` and wired `verify-aies-quick.ps1` to prove the current corpus yields at least one local signal, one ambiguous signal, and one explicit `insufficient_evidence` result.
  - The validation path now checks that the mapper can say "unclear" when evidence is too thin instead of forcing every inconsistency into a neat category.
- [ ] Record the experiment back into theory and memory.
  - Capture whether the local/global split made later work selection more coherent or merely added another descriptive layer.
  - Update `memory/theory-fork/layers/coherence.md` if the experiment reveals a sharper practical definition for single-agent coherence.

## Notes
- Grounding:
  - `memory/theory-fork/layers/coherence.md`
  - `memory/theory-fork/index.md`
  - `memory/knowledge/coherence-charter.yaml`
  - `memory/knowledge/intent-hierarchy.yaml`
  - `docs/foundations/AI-Human-Stack-Component-Reference-Map.md`
  - `docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md`
- This change intentionally rotates into the neglected coherence dimension while reusing the new theory-question lab and evolution evidence capabilities instead of inventing a free-floating review layer.
- Suggested paths: `aies/extensions/`, `memory/knowledge/`, `memory/theory-fork/`, `openspec/changes/`, `operator-ui/`.
