---
change_id: CHG-2026-03-16-audit-guidance-adaptation
title: Tune audit guidance from real effectiveness history
status: proposed
generated_from_audit_snapshot: audit-2026-03-16T03-09-45-963Z
generated_from_dimension: evaluation
---

## Summary
Audit snapshot `audit-2026-03-16T03:09:45.963Z` rated **evaluation** as the current binding constraint even after judgment improved to **strong**. The audit can now emit guidance, record whether later cycles aligned with it, and compare that alignment against post-run audit movement — but it still lacks a disciplined way to learn from repeated guidance-effectiveness history without collapsing back into speculative meta-evaluation.

The next capability step is to turn durable guidance-effectiveness history into a bounded, advisory learning surface. The aim is not to let evaluation prescribe future behavior. The aim is to help future cycles see when the current guidance synthesis appears trustworthy, when it keeps producing stagnant weak layers, and when divergent choices are outperforming aligned ones. This directly targets the audit's current recommendation: use repeated guidance-effectiveness reports to tune how audit guidance is synthesized.

Right now the history is still thin: there is only early durable evidence, including a recent counter-signal in `guidance-effectiveness/`. That is enough to justify planning the learning policy, but not enough to justify an aggressive auto-tuning loop. The change should therefore focus on threshold-gated, operator-visible, advisory synthesis — not automatic policy replacement.

## Tasks
- [x] Define guidance-tuning thresholds and redlines.
  - Specify the minimum repeated-history conditions required before guidance-effectiveness patterns are treated as actionable rather than anecdotal.
  - Make the redline explicit: the system may summarize evidence and recommend adjustments, but it must not auto-overwrite audit guidance or convert advisory evaluation into a coercive planner.
- [x] Implement a repo-native guidance adaptation summary tool.
  - Add a module under `aies/extensions/evaluation/` that aggregates durable `guidance-effectiveness/`, `guidance-outcomes/`, recent audit snapshots, and verification-floor data into a compact pattern summary.
  - Require the tool to emit `insufficient_history` plainly when thresholds are not met.
- [x] Bridge the summary into live guidance surfaces without creating a new control loop.
  - Feed a compact adaptation note into the audit guidance prompt/runtime surfaces only as context for judgment.
  - Keep the bridge advisory and bounded: it should annotate current guidance with historical trust signals, not replace the current binding-constraint recommendation.
- [x] Expose the learning signal in an operator-visible inspection path.
  - Surface the adaptation summary in an existing operator-visible trail or status surface so later cycles can inspect why the guidance was annotated as trusted, mixed, counter-signaled, or still too thin to use.
- [x] Validate against real durable history.
  - Prove the tool behaves conservatively on today's small corpus by showing an explicit insufficient-history or low-confidence output instead of fabricating certainty.
  - Re-run the relevant audit/evaluation path after implementation and confirm whether the evaluation-layer summary or highest-leverage-next-step changes in an observable way.
- [x] Record the experiment back into theory and memory.
  - Capture whether threshold-gated guidance adaptation improved future work selection without reviving the removed self-referential meta-evaluation layers.

## Notes
- This change intentionally follows the evaluation theory note that evaluation should end in guidance, while also respecting the warning that guidance alignment is not guidance effectiveness.
- It also follows the harness theory note that proof and inspection should stay cheap where possible; the adaptation surface should lean on already-persisted reports instead of requiring recursive orchestration runs.
- Keep the design grounded in real data. A tool that mostly says "insufficient history" at first is acceptable if that honesty prevents another speculative review stack.
- Suggested paths: `aies/extensions/evaluation/`, `aies/extensions/cycle-runner/`, `operator-ui/`, `memory/theory-fork/meta/`
