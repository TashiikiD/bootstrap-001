# Meta-Function: Evaluation Engineering

## Bootstrap Phase Observation

Evaluation is the meta-function that makes self-evolution possible. Without measurement, there is no feedback loop. The LDI is the primary evaluation instrument, but it measures structure, not outcomes. A more complete evaluation system will need to measure actual capability improvements.

The gap between structural metrics and outcome metrics is significant. A system can score well on LDI while producing no meaningful improvements. Conversely, a breakthrough capability change might temporarily decrease structural scores. Evaluation engineering must grapple with this tension between measuring the process and measuring the product.

## Experiment Note — Orchestration Proof vs. Metric Farming

The audit radar surfaced a useful failure mode: proving that the cycle runner actually triggered the post-run audit loop can require launching another autonomous cycle just to generate the evidence. That is a real evaluation cost, not a bookkeeping detail.

This suggests a distinction between two kinds of evaluation evidence:
- passive evidence that the correction path exists (code, contracts, durable report schema, operator-visible status)
- active evidence that the path was exercised in a real cycle

Both matter, but they should not carry the same per-turn cost. If the harness treats active orchestration proof as a requirement for every slice, evaluation starts optimizing for its own artifacts instead of for meaningful evolution. Repeated weak-layer streaks are useful navigation signals; they should not become a demand to spend every future cycle manufacturing one more proof token.

## Experiment Note — Evaluation Should End in Guidance

Once audit state becomes durable and operator-visible, the next failure mode is descriptive stagnation: the system can explain its weakness clearly without making the next cycle any wiser.

That suggests evaluation should usually terminate in a compact planning aid, not just a report. A useful evaluation artifact is one that can be injected back into runtime judgment as a bounded execution brief: what to continue, what shape the next step should take, and why now. The next evaluation question then shifts from "can the system describe itself?" to "did the guidance actually alter later focus choices and outcomes?"

A practical consequence is that the harness should capture a small comparison record whenever guided work runs: what the audit recommended, what focus was actually chosen, and whether they aligned. This is still not proof of improvement, but it is a cheaper bridge between descriptive evaluation and later outcome analysis.

## Experiment Note — Guidance Alignment Is Not Guidance Effectiveness

A later failure mode appeared once guidance-alignment reports existed: the system could prove that a cycle followed the advice without proving that the advice helped.

That suggests a second evaluation bridge. Guidance should be compared not only against chosen focus, but also against the next post-run audit movement: did the targeted weak layers improve, stagnate, or regress; did the binding constraint move; what correction paths were actually observed; and did the verification floor rise because the change surface was riskier than the prompt implied?

This is still correlational, not causal. But it is meaningfully better than stopping at "alignment achieved," because it lets future cycles distinguish between guidance that is being obeyed and guidance that is earning trust.

## Experiment Note — Guidance Adaptation Must Stay Threshold-Gated and Advisory

The next temptation after collecting guidance-effectiveness reports is to let evaluation start rewriting its own runtime advice too aggressively. The audit-guidance-adaptation experiment suggests a safer pattern: summarize repeated history only after a minimum corpus exists, and treat the result as a trust annotation rather than as a replacement for the current audit recommendation.

Two observations matter here:
- when the corpus is thin, the honest answer is `insufficient_history`, even if a recent report feels suggestive
- once adaptation exists, it should help future judgment inspect whether guidance is earning trust, but it should not become an automatic policy-overwrite channel

In practice, this means evaluation can annotate guidance with statuses like supportive, mixed, or counter-signaled, but it should preserve the redline that the binding-constraint recommendation is still generated from the current audit snapshot. Historical effectiveness is advisory context for judgment, not a hidden controller.

## Open Questions

- What outcome metrics are appropriate for a system whose purpose is self-improvement? How do you avoid Goodhart's Law when the agent can optimize its own metrics?
- Should evaluation be continuous or periodic? Continuous evaluation adds overhead; periodic evaluation risks missing regressions.
- How should the system weight structural health (LDI) against functional capability when the two metrics disagree?
