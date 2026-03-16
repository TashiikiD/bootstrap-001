# Devlog — guidance experiment decision bridge

- Date: 2026-03-16T02:05:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

AIES could already:

- plan a bounded next posture experiment
- review whether that experiment had started, was in progress, or was complete
- observe whether the early signal was supportive, counter, mixed, or insufficient

But guidance synthesis still lacked the next bridge:

- what should future guidance do with that execution evidence?

Without that bridge, experiment review still risked becoming another passive artifact.

## What changed

- Added `aies/extensions/evaluation/audit-radar-guidance-experiment-decision.ts`.
- The new module converts the latest bounded experiment plan plus its execution review into a durable steering decision:
  - `start_planned_experiment`
  - `continue_planned_experiment`
  - `fallback_to_baseline`
  - `reinforce_nonbaseline`
  - `hold_baseline`
  - `compare_again`
- The decision report records:
  - experiment signature
  - observed/analyzed relevant cycle counts
  - execution status
  - signal direction
  - recommended guidance posture
  - bounded recommendation note
  - rationale
  - guardrails
- Added `/audit-radar-guidance-experiment-decision`.
- Updated `aies/extensions/evaluation/audit-radar-guidance.ts` so next-cycle audit guidance now incorporates experiment-decision synthesis instead of only exposing experiment planning and review.
- Wired guided cycle completion to auto-persist an experiment-decision report after outcome, effectiveness, learning-review, experiment-review, and post-run planning evidence are available.
- Extended operator observability so cycle-run audit history can show experiment-decision report paths, decision type, recommended posture, and summary.
- Updated scanner and assessment rules so future audits can distinguish:
  - experiment review exists
  - experiment review is steering future guidance

## Insight

Execution review is evaluative.
Decision synthesis is judgmental.

A self-evolution harness needs both if it wants evidence to steer later turns.

Otherwise it can say:
- "the exploratory probe is still in progress"
- or "the exploratory probe completed with a counter-signal"

while still generating the next guidance as though neither fact matters.

## Next question

The next useful test is no longer whether AIES can describe or decide from bounded experiment evidence.
It is whether repeated real guided cycles make those decisions trustworthy:

- do fallback decisions reduce repeated counter-signals?
- do reinforcement decisions preserve constructive edges?
- do compare-again decisions prevent premature policy swings?
