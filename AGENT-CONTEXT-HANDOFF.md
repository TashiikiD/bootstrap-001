# AIES v2 — Agent Context Handoff

## What this project is
This repo is intended to become **AIES v2**: a new self-evolving agent harness built on top of **Pi-Mono** as the execution core.

The goal is **not** to keep patching the old AIES runtime forever. The old harness repeatedly converted ordinary provider latency and task-shape issues into cycle-killing failures. We concluded that the execution substrate itself is the main problem.

So the new plan is:
- use **Pi-Mono** for model execution, tools, and extensibility
- preserve **AIES** as the higher-order self-evolution layer

## Why this exists
The prior harness had strong ideas but a brittle runtime:
- provider retry/orchestration became too complex and failure-prone
- implementation calls often stalled or timed out
- task planning and file-edit execution were too tightly coupled and brittle
- too much energy went into keeping the runtime alive instead of enabling real self-evolution

This new project is meant to keep the **important ideas** while replacing the fragile execution core.

## What must be preserved from old AIES
The following concepts are core to the identity of AIES and should survive migration:

### 1) Self-evolution is the main purpose
The system is not a generic assistant first. It exists to evolve itself into a more capable, coherent, reflective agent.

### 2) The 5+2 framework remains the conceptual core
The AI-Human Engineering Stack still matters:
- Prompt
- Context
- Intent
- Judgment
- Coherence
- Evaluation
- Harness

But in v2 this should be used as a **guiding theory**, not as an over-restrictive mechanical leash.

### 3) Heartbeat remains
There should still be a heartbeat/cycle mechanism.

However, in v2 the heartbeat should be understood primarily as:
- a wakeup/orchestration mechanism
- a continuity and cadence mechanism

It should **not** rigidly force the agent into brittle behavior.

### 4) Memory remains
The new system should preserve:
- lessons / decisions / patterns
- session continuity
- devlog / reflection
- theory fork

### 5) OpenSpec remains desirable
Longer-running multi-session planning is still wanted.

### 6) Transparency is mandatory
The system needs strong observational transparency via **web UI at minimum**.
TUI is optional.

## Key philosophical change in v2
The old harness became too strict.

Examples of what we want less of:
- “only target the exact lowest LDI dimension every cycle”
- hard gates that block otherwise useful work
- forcing the agent to satisfy narrow benchmark requirements before it can do meaningful self-improvement elsewhere

The user explicitly wants **more freedom** for a capable agent.

The new direction is:
- keep purpose
- keep evaluative observation
- keep balance and drift awareness
- but let the agent **exercise more judgment and freedom**

In short:
- **LDI should be observational, advisory, and reflective**
- **not a strict governor**

## What Pi-Mono is expected to provide
Pi-Mono is being chosen because it appears to be:
- coding-agent-native
- extension-first
- customizable through supported surfaces instead of deep fork-only hacks
- a better candidate execution substrate than the current bespoke AIES runtime

The expectation is:
- Pi handles execution, tools, provider interactions, and runtime substrate
- AIES supplies purpose, reflection, memory, evaluative framing, and self-evolution structure

## Working direction for implementation
When building AIES v2, prefer this architecture:

### Pi core owns
- model/provider execution
- tool calling
- file editing and shell actions
- extension/resource loading
- agent runtime session substrate

### AIES layer owns
- heartbeat wakeups
- cycle framing and reflective orchestration
- memory systems
- theory fork
- OpenSpec continuity
- observational LDI / drift / balance
- self-evolution policy prompts
- transparency/UI overlays

## Practical design guidance

### Prefer guided autonomy over strict control
The system should:
- observe imbalance
- notice neglected dimensions
- encourage balanced development
- ask the agent to justify focus choices

But it should not over-constrain the agent into a single path every cycle.

### Prefer extension-first architecture
Avoid rebuilding a brittle monolithic runtime.
If Pi supports extensions/hooks/resources, use those first.

### Prefer simpler execution paths
The old system became too failure-prone partly because its execution path was too elaborate.
Avoid unnecessary retry/amplification layers and overly clever orchestration.

### Prefer transparency over hidden policy
If the system nudges behavior, it should be visible in the UI or logs as advisory context.
Avoid hidden, mysterious coercion.

## Suggested immediate priorities
The likely early sequence for this repo should be:
1. stand up Pi-Mono as the execution base
2. prove a minimal self-evolution cycle can run on it
3. reintroduce memory + theory fork
4. reintroduce OpenSpec-style continuity
5. rebuild LDI as observational guidance
6. build the web transparency surface

## Anti-goals
Do **not** recreate the old harness’s worst traits:
- over-engineered provider retry stacks
- giant brittle edit prompts
- strict lowest-dimension coercion
- scoring gates that prevent meaningful exploratory improvement
- hidden “success” semantics that obscure what actually happened

## Success criteria for AIES v2
This new system is successful if:
- it actually completes cycles reliably
- it evolves itself meaningfully over time
- it remains grounded in the 5+2 theory
- it preserves reflection, continuity, and purpose
- it gives the agent more freedom without losing coherence
- a human operator can clearly see what it is doing and why

## Final reminder
This project is not just “AIES but on a different runtime.”

It is also an opportunity to correct a deeper design mistake:
the old system overconstrained a capable agent.

The new system should keep the theory and purpose, but give the agent more room to actually evolve.
