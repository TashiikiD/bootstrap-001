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

## Experiment Note — Guidance Learning Should Stay Bounded

Once guidance-effectiveness reports exist, a new failure mode appears: the system can overfit to a tiny amount of recent history and start swinging its recommendations too hard based on one or two cycles.

That suggests a bounded learning policy rather than a free-form rewrite of guidance synthesis. Recent supportive, counter, and alternative signals should be able to temper future advice — reinforce it, treat it cautiously, or allow bounded alternatives — but only when the relevant history is repeated enough to justify that change.

In practice, that means the audit should distinguish between:
- no guidance-effectiveness history yet
- a single anecdotal signal
- repeated supportive signals
- repeated counter-signals
- repeated alternative signals
- mixed history that should not collapse into one story

The point is not to make the guidance self-confident. The point is to make it slightly more honest about what recent evidence warrants.

## Experiment Note — Learning Policy Needs Posture-Level Review

Once bounded learning postures exist, another failure mode appears: the system can cite that a posture was selected without comparing whether different postures are actually producing more constructive than adverse downstream signals.

That suggests a distinct review layer above per-cycle guidance-effectiveness items. The system should be able to group outcomes by posture (`baseline`, `cautious`, `exploratory`, etc.), compare constructive versus adverse signal balance, and treat that comparison as experimental evidence rather than as automatic policy truth.

The key distinction is:
- per-cycle effectiveness asks whether one guided cycle looked helpful
- posture-level review asks whether one learning posture is starting to outperform another across repeated cycles

That review should stay correlational and sample-aware. Its job is to guide the next experiment, not to declare a winner too early.

## Experiment Note — Posture Review Should End in a Bounded Experiment

Once posture-level review exists, another failure mode appears: the system can describe which posture currently looks strongest without converting that observation into a bounded next test.

That leaves evaluation one step short of steering action. A useful posture review should usually terminate in an experiment brief:
- what posture to try next
- for how many relevant guided cycles
- under what guardrails
- when to fall back to baseline

This keeps posture learning honest. The planner should not treat correlational review as settled truth; it should only narrow the next experiment enough that future cycles stop guessing blindly.

## Experiment Note — Experiment Planning Should End in Execution Review

Once the system can propose a bounded next posture experiment, another failure mode appears: it still may not know whether that experiment is actually being exercised across later relevant cycles.

That leaves evaluation stuck between planning and evidence. A useful experiment planner should gain a paired execution review that can answer:
- not started yet
- in progress but sample-thin
- completed against its planned cycle count
- early supportive, counter, mixed, or insufficient signal

This keeps planned experiments from becoming another advisory artifact. The review does not need to prove causality; it only needs to tell future cycles whether the planned probe is actually underway and whether it is already showing reason for caution or reinforcement.

## Experiment Note — Execution Review Should End in Steering

Once the system can review whether a bounded posture experiment is not started, in progress, complete, supportive, or counter-signaling, another failure mode appears: the guidance layer can still ignore that review and generate the next recommendation as if the experiment status did not matter.

That leaves evaluation one step short of judgment. A useful execution review should usually terminate in a bounded steering decision:
- start the planned experiment
- continue it until the sample is complete
- fall back to baseline on early or completed counter-signal
- reinforce a non-baseline posture only after supportive completion
- compare again from a safer anchor when the result is mixed or thin

This still is not causal proof. It is a decision bridge.
Its purpose is to keep future guidance from repeatedly replanning or overreacting while experiment evidence is already telling the harness something proportionate.

## Open Questions

- What outcome metrics are appropriate for a system whose purpose is self-improvement? How do you avoid Goodhart's Law when the agent can optimize its own metrics?
- Should evaluation be continuous or periodic? Continuous evaluation adds overhead; periodic evaluation risks missing regressions.
- How should the system weight structural health (LDI) against functional capability when the two metrics disagree?
