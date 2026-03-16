# Meta-Function: Harness Engineering

## Bootstrap Phase Observation

This harness IS the Harness Engineering meta-function made real. The recursive nature is significant — the harness engineers itself. The relationship between the kitchen (harness) and recipe (layers) means that improving the harness changes what's feasible, not what's intended.

A better kitchen does not change what you want to cook, but it changes what you can cook. Similarly, improvements to the evolution harness expand the space of possible self-modifications without dictating which modifications should occur. This separation of capability from intent is a core architectural insight.

## Experiment Note — Harness Self-Proof Has a Cost

A harness hook that can only be validated by spawning another autonomous cycle creates recursive pressure: the harness spends evolution turns proving itself instead of using those turns to evolve. The active audit-radar work exposed this directly once post-run audit execution existed in code but durable `cycle_runner` evidence still required an additional run to appear.

The harness should therefore expose cheaper self-observation surfaces wherever possible. Lightweight status views, durable report histories, and explicit provenance fields are preferable first-line proof surfaces. Full end-to-end orchestration runs still matter, but they should be treated as explicit experiments or operator-invoked verification, not as the default cost of every cycle.

## Experiment Note — Verification Should Have a Change-Surface Floor

Prompt- or focus-inferred verification mode is not enough once the harness can inspect what files a cycle actually touched. If the run changed verification substrate or orchestration code, the minimum trustworthy verification depth should rise even when the prompt sounded narrow.

That suggests a harness pattern: capture the repo surface before a cycle, compare it again before post-run audit artifacts are written, and let the changed-file surface set a minimum verification floor. This keeps verification proportionate without pretending that prompt labels alone can describe execution risk.

## Experiment Note — Durable Learning Surfaces Should Piggyback on Existing Runs

The guidance-adaptation work exposed a practical harness rule: if a learning surface depends on evidence that a normal guided run already emits, the harness should refresh that learning surface as part of the same run instead of requiring a second orchestration pass.

This keeps self-observation cheap. A guided cycle can now emit guidance outcome evidence, guidance-effectiveness evidence, and a refreshed adaptation summary in one bounded path. That is enough to make the learning surface durable and operator-visible without turning harness validation into a recursive demand for another autonomous session.

The deeper harness lesson is that persistence and visibility can do real work before additional orchestration does. If a new evaluation surface can be updated from already-persisted artifacts, prefer that route first.

## Open Questions

- When the harness modifies itself, how do you ensure the modification preserves the harness's ability to evaluate future modifications? Self-modification of the evaluation substrate is the most dangerous kind.
- What is the minimal viable harness — the smallest set of mechanisms that still enables meaningful self-evolution?
- How should harness improvements be validated differently from layer improvements, given that harness failures can be catastrophic in ways layer failures cannot?
