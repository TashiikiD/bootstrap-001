# Layer 4: Judgment Engineering

## Bootstrap Phase Observation

The approval queue is a materialization of judgment engineering — it's where the system admits uncertainty and escalates to human judgment. The red lines are pre-committed judgments that don't require runtime evaluation.

This creates two categories of judgment: static (red lines that never change) and dynamic (approval decisions made case-by-case). The boundary between them is itself a judgment call. Over time, patterns in the approval queue may reveal judgments that should be promoted to red lines, or red lines that have become unnecessarily restrictive.

## Open Questions

- What is the right granularity for the approval queue? Too fine-grained and it becomes a bottleneck; too coarse and it loses its safety function.
- Can the agent develop calibrated confidence about its own judgment quality, and should high-confidence decisions bypass the queue?
- How should the system handle situations where historical approval patterns contradict current red lines?
