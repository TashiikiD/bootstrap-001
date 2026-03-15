# Devlog — bounded guidance learning policy

- Date: 2026-03-15T23:52:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

The audit radar could already do three useful things:
- recommend a next-step guidance brief
- record whether a cycle followed that guidance
- compare the guidance outcome against later audit movement

But those signals still ended as passive history.

That left a gap between evaluation and judgment. The system could observe whether guidance seemed useful without letting that observation temper the next guidance brief.

## What changed

- Added `aies/extensions/evaluation/audit-radar-guidance-learning.ts`.
- The new module reads the latest durable guidance-effectiveness history and synthesizes a bounded learning posture:
  - `baseline`
  - `reinforce`
  - `cautious`
  - `exploratory`
  - `mixed`
- Updated `aies/extensions/evaluation/audit-radar-guidance.ts` so `/audit-radar-next` and prompt injection now carry:
  - the learning posture
  - a short learning signal summary
  - a recommendation note that tempers future guidance without replacing the binding constraint
- Updated guidance-capture surfaces so future guided cycles preserve which learning posture was active when the guidance was issued.
- Updated audit scanner and assessment rules so future audits can cite the learning-policy bridge explicitly.

## Insight

Guidance learning should be real, but bounded.

One or two cycles are enough to create a hint.
They are not enough to justify a wholesale rewrite of guidance synthesis.

So the audit should not jump from:
- "one aligned cycle stagnated"

directly to:
- "the guidance was wrong"

Instead it should shift posture proportionately:
- reinforce when supportive signals repeat
- become cautious when counter-signals accumulate
- allow bounded alternatives when divergent choices repeatedly outperform aligned ones
- stay mixed when the story is unclear

## Next question

The next meaningful experiment is not whether the policy exists, but whether repeated guided cycles under `cautious` or `exploratory` posture actually improve later audit movement more often than baseline guidance alone.
