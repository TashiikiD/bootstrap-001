# Devlog — guidance experiment planner

- Date: 2026-03-16T00:50:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

The audit radar could already:
- capture whether guidance was followed
- compare whether followed guidance correlated with later audit movement
- synthesize a bounded learning posture
- review posture-level constructive versus adverse balance

But it still stopped one step short of deliberate experimentation.

That meant AIES could say:
- "exploratory currently looks promising"
- or "baseline still looks safer"

without turning that observation into a bounded next experiment for future cycles.

## What changed

- Added `aies/extensions/evaluation/audit-radar-guidance-experiment.ts`.
- The new module converts guidance-learning policy plus posture-review evidence into a durable experiment brief.
- The experiment brief records:
  - current learning posture
  - recommended next posture
  - experiment type (`hold_baseline`, `probe_nonbaseline`, `reinforce_nonbaseline`, `reset_to_baseline`, `compare_mixed`)
  - planned relevant cycle count
  - review confidence
  - posture-review context and guardrails
- Added `/audit-radar-guidance-experiment`.
- Updated `aies/extensions/evaluation/audit-radar-guidance.ts` so next-cycle audit guidance now carries an explicit posture experiment recommendation instead of only a posture summary.
- Wired guided cycle completion to auto-persist a guidance-experiment report after learning review, and extended cycle-runner/operator observatory surfaces so that report path and summary are visible.
- Updated audit scanner and assessment rules so future audits can distinguish "posture review exists" from "the harness can propose a bounded next posture experiment."

## Insight

Posture review is descriptive.
Experiment planning is directional.

A self-evolving system needs both.

Without a bounded experiment planner, posture-level learning still depends on future cycles improvising what to do with the review. That is better than no review, but it is still weaker than a harness-native recommendation that says:
- keep baseline
- try one bounded exploratory probe
- reinforce the current leading posture for two more relevant cycles
- or reset to baseline because the current non-baseline posture is underperforming

## Next question

The next meaningful experiment is to actually execute repeated relevant guided cycles under the new bounded experiment plans and see whether the planner helps AIES gather cleaner posture-comparison evidence instead of just generating another advisory artifact.
