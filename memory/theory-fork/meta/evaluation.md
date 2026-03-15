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

## Open Questions

- What outcome metrics are appropriate for a system whose purpose is self-improvement? How do you avoid Goodhart's Law when the agent can optimize its own metrics?
- Should evaluation be continuous or periodic? Continuous evaluation adds overhead; periodic evaluation risks missing regressions.
- How should the system weight structural health (LDI) against functional capability when the two metrics disagree?
