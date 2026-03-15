# Devlog — guidance effectiveness orchestration

- Date: 2026-03-15T22:05:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

The previous slice added a comparator for guidance effectiveness, but it still depended on a human or later cycle remembering to run `/audit-radar-guidance-effectiveness`.

That left an avoidable harness gap: AIES could create guidance, compare later focus against that guidance, and run a post-run audit loop — yet still fail to automatically join those artifacts at the exact moment they were most coherent.

## What changed

- Guided `/cycle-run` completion now builds the `guidance-outcomes/` report object first, persists it, and immediately derives a one-cycle `guidance-effectiveness/` report from that same run.
- `aies/extensions/cycle-runner/state.ts` now records the effectiveness report path, verdict, and summary in cycle-runner state.
- `aies/extensions/cycle-runner/index.ts` and `operator-ui/server/index.ts` now surface that effectiveness state so operators and future cycles can inspect it without an extra manual comparison step.

## Insight

This is a harness lesson as much as an evaluation lesson:
- a comparator that exists only as a manual command is still optional memory work
- a comparator emitted during the same orchestration window becomes part of the run’s native audit trail

That does not solve causality. But it does reduce inspection cost and remove one more place where future cycles could drift back into manual ceremony.

## Next question

If guidance-effectiveness reports accumulate automatically, the next meaningful step is not more report generation. It is learning policy: deciding when repeated counter-signals should change how audit guidance is synthesized or when repeated supportive signals are strong enough to trust.
