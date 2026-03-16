# Devlog — guidance experiment execution review

- Date: 2026-03-16T01:25:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

AIES could already plan a bounded next posture experiment, but it still lacked a durable answer to a basic evaluation question:

- has that experiment actually started?
- is it still in progress?
- has it reached the planned number of relevant guided cycles?
- are the early signals supportive, counter, mixed, or still too thin?

Without that review layer, experiment planning still risked becoming another passive advisory artifact.

## What changed

- Added `aies/extensions/evaluation/audit-radar-guidance-experiment-review.ts`.
- The new module groups durable guided-cycle evidence by bounded experiment signature:
  - binding constraint
  - target dimensions
  - experiment type
  - recommended next posture
  - planned relevant cycle count
- It links matching guidance-outcome and guidance-effectiveness history to produce a durable execution review with:
  - observed relevant cycle count
  - analyzed cycle count
  - alignment counts
  - verdict counts
  - linked post-run audit count
  - verification-floor escalation count
  - execution status (`not_started`, `in_progress`, `completed`)
  - signal direction (`supportive`, `counter`, `mixed`, `insufficient`)
- Added `/audit-radar-guidance-experiment-review`.
- Wired guided cycle completion to auto-persist an experiment-execution review for the experiment that actually guided the run.
- Extended operator observability so cycle-run audit history now exposes experiment-review report paths, status, signal, and summary.
- Updated audit scanner and assessment rules so future audits can distinguish:
  - bounded experiment planning exists
  - bounded experiment execution review exists

## Insight

Planning an experiment is directional.
Reviewing whether it is actually being exercised is evaluative.

A self-evolving harness needs both.

Otherwise the system can say "try exploratory for two relevant cycles" without being able to say whether that recommendation is still hypothetical or already producing enough early signal to justify caution, continuation, or reset.

## Next question

The next meaningful experiment is no longer just to create another guidance surface. It is to accumulate enough repeated real guided cycles that the new execution review can move from `in_progress` to `completed` and compare whether bounded non-baseline probes are actually outperforming baseline.
