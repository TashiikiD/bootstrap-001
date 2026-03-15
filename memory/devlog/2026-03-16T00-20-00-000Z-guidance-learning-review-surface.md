# Devlog — guidance learning review surface

- Date: 2026-03-16T00:20:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

The audit radar could already do two important learning moves:
- synthesize a bounded guidance-learning posture from recent effectiveness history
- preserve that posture in later guided-cycle evidence

But it still lacked a posture-level inspection surface.

That meant future cycles could see that a posture existed without being able to compare whether `baseline`, `cautious`, or `exploratory` were actually producing more constructive than adverse downstream signals.

## What changed

- Added `aies/extensions/evaluation/audit-radar-guidance-learning-review.ts`.
- The new module deduplicates durable guidance-effectiveness items, rejoins them with captured guidance posture, groups them by posture, and produces a durable review report.
- The review summarizes each posture with:
  - sample count
  - tracked dimensions
  - verdict counts
  - constructive vs adverse signal balance
  - linked post-run audit coverage
  - binding-constraint shift/persistence counts
- Added `/audit-radar-guidance-learning-review` to emit and persist that posture-level review explicitly.
- Wired guided cycle completion to auto-persist a guidance-learning review after persisting guidance-effectiveness evidence, so the review no longer depends only on later manual command use.
- Extended cycle-runner and operator-ui audit history so the latest learning-review report path and summary are visible alongside the existing guidance-outcome and guidance-effectiveness artifacts.

## Insight

A bounded learning policy is not self-validating.

If the system says "be cautious" or "allow alternatives," that is still just a posture choice until later evidence can compare whether those postures are earning more constructive than adverse signals than baseline guidance alone.

So evaluation needs one more layer:
- per-cycle judgment
- posture-level review

The first tells you whether one guided cycle looked helpful.
The second tells you whether one guidance-learning posture is starting to outperform another.

## Next question

The next meaningful experiment is to accumulate repeated non-baseline guided cycles and see whether the new posture-level review starts distinguishing a genuinely stronger posture from baseline, or whether the evidence remains too mixed to justify stronger policy shifts.
