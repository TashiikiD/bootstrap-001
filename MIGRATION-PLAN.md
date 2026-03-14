# AIES v2 Implementation Plan - Pi-Mono Extension Architecture

## Status
- Status: Draft 1, canonical planning artifact for the current migration effort
- Scope: AIES v2 only
- Execution core: `Pi-Mono`
- Control philosophy: guided autonomy first, tighter controls only when runtime evidence justifies them

## Request Summary
Rebuild AIES as a self-evolving coding-agent system on top of `Pi-Mono` without recreating the brittle execution substrate of the previous harness. Preserve the identity of AIES - heartbeat cadence, self-evolution purpose, memory, theory fork, OpenSpec continuity, observational evaluation, and transparency - while moving execution, tool use, model interaction, and session runtime onto Pi's extension-oriented substrate.

This plan is intentionally written for step-by-step execution with context compaction between slices.

## Goal
Deliver an `AIES v2` system that:
- uses `Pi-Mono` as the execution substrate
- implements AIES as a set of separate extension modules, not a forked runtime
- starts loose and advisory rather than rigid and coercive
- preserves multi-session self-evolution continuity
- exposes cycle state and rationale clearly enough for human supervision

## Problem Statement
The previous harness failed less because the underlying models were incapable and more because the harness itself amplified ordinary runtime friction into system-level failure. Key problems included:
- over-engineered provider and retry paths
- brittle coupling between planning and implementation
- hard behavioral gates that blocked useful work
- excessive coercion toward narrow metrics rather than meaningful evolution
- weak observability about what the system was doing and why

The migration must avoid reproducing those traits.

## Design Principles

### 1) Preserve AIES as the meta-layer
AIES should continue to own:
- self-evolution purpose
- heartbeat and cadence
- reflection and devlog
- memory and theory fork
- long-horizon continuity
- evaluation and drift awareness
- operator-facing transparency

### 2) Let Pi own execution
`Pi-Mono` should own:
- provider and model interaction
- tool invocation
- shell and file editing
- session runtime substrate
- extension loading
- interactive and RPC execution surfaces

### 3) Prefer loose guidance over tight coercion
Start with:
- visible suggestions
- rationale capture
- drift reporting
- lightweight cycle framing

Avoid, at first:
- hard focus locks
- forced weakest-dimension targeting
- hidden success gates
- benchmark unlock mechanics
- heavy command-and-control behavior

### 4) Keep AIES modular
Each AIES concern should live in its own module so it can be:
- enabled or disabled independently
- debugged in isolation
- upgraded without destabilizing unrelated behavior
- compared against upstream Pi changes with low merge pain

### 5) Treat upstream Pi as upstream
Modify Pi core only if all of the following are true:
- a required hook is missing
- the change cannot be cleanly live in an extension
- the patch is small and upstream-friendly
- the benefit is clear enough to justify future sync cost

## Success Criteria

### Functional success
- AIES can run on top of Pi without the legacy execution stack
- one full self-evolution cycle completes end-to-end using Pi tools
- session continuity survives restarts
- memory, devlog, and theory artifacts persist in human-readable form
- OpenSpec-backed work can continue across multiple cycles
- observational evaluation is visible but not coercive
- operator-facing transparency exists at least in CLI/TUI status form, with web UI following after

### Architectural success
- AIES logic is implemented as separate extension modules and resource packages
- Pi core remains mostly untouched
- AIES-specific code is kept outside the upstream Pi code path where practical
- upgrading or re-syncing `pi-mono` does not require redoing AIES architecture

### Behavioral success
- the system begins with loose guidance and only adds controls after observed need
- the agent can justify non-obvious focus choices without being treated as invalid
- the harness helps the agent evolve rather than primarily restricting it

## Constraints
- `Pi-Mono` is the execution substrate
- extension-first architecture is mandatory unless blocked by missing hooks
- web transparency is required eventually; TUI-only is not the end state
- memory artifacts should remain human-readable where possible
- OpenSpec continuity should be preserved unless a Pi-native planning primitive clearly supersedes it
- control policy must remain visible and inspectable, not hidden in opaque internal logic

## Non-Goals
- recreating the legacy AIES provider/router/implementer runtime
- building a strict benchmark-gated agent in the first pass
- solving every safety/control question up front
- building a generalized assistant platform outside the self-evolving coding-agent scope
- forking large parts of Pi because "it might be useful later"
- shipping a polished web dashboard before basic cycle continuity works

## Uncertainty Policy
- When a design choice is reversible, choose the simpler and looser path first.
- When a choice would create long-term coupling to Pi internals, prefer decoupling even if it adds a little local plumbing.
- When a behavior can be advisory or mandatory, start advisory unless repeated failures justify escalation.
- When the right abstraction is unclear, implement the thinnest slice that proves the contract before generalizing.

## Tradeoff Rules
- Prefer transparency over cleverness.
- Prefer fewer cross-module dependencies over convenience.
- Prefer file-based artifacts over hidden session-only state for durable AIES identity.
- Prefer targeted constraints informed by evidence over broad front-loaded control.
- Prefer upstream syncability over local runtime heroics.

## Canonical Architecture

### Top-level model
- `Pi` is the execution engine.
- `AIES` is a package of extensions, prompts, skills, contracts, and durable artifacts layered on top.
- `AIES` should communicate across modules through explicit contracts, Pi events, persisted entries, and file-based artifacts.

### Responsibility split

#### Pi core owns
- model/provider execution
- tool execution lifecycle
- shell/file tooling
- session management
- extension registration and loading
- interactive CLI/TUI and RPC substrate

#### AIES layer owns
- heartbeat scheduling and cycle orchestration
- reflective cycle framing
- advisory evaluation and drift awareness
- memory, devlog, and theory fork
- OpenSpec continuity
- operator-facing AIES state publication
- self-evolution policy prompts and skills

## Proposed Repository Layout
The layout should keep AIES code separate from upstream Pi code.

```text
E:\Coding\AIESv2\
  AGENT-CONTEXT-HANDOFF.md
  MIGRATION-PLAN.md
  pi-mono\
  .pi\
    settings.json
    SYSTEM.md
    APPEND_SYSTEM.md
  aies\
    contracts\
    extensions\
      shared\
      heartbeat\
      policy\
      memory\
      openspec\
      evaluation\
      operator-ui\
      verification\
    prompts\
    skills\
    scripts\
    testdata\
  memory\
    knowledge\
    theory-fork\
    devlog\
  openspec\
    changes\
  handoffs\
  docs\
```

## Rationale for This Layout
- `pi-mono/` remains an upstream workspace, easy to update or diff.
- `.pi/` at the AIES root becomes the project-local Pi configuration surface.
- `aies/` contains all AIES-specific implementation, separate from upstream internals.
- `memory/` and `openspec/` remain first-class AIES artifacts rather than being buried inside tool state.
- `handoffs/` exists specifically to support compacting context between execution slices.

## Configuration Strategy

### Project-local Pi configuration
Use `.pi/settings.json` in the AIES root to load:
- AIES extensions from `aies/extensions/...`
- AIES prompts from `aies/prompts/...`
- AIES skills from `aies/skills/...`

### Prompt strategy
Use:
- `.pi/SYSTEM.md` only if we need to replace Pi's default prompt entirely
- `.pi/APPEND_SYSTEM.md` for global AIES additions that should always be present
- `before_agent_start` in the policy extension for dynamic per-cycle context and guidance

### Session and runtime data strategy
Separate durable human-readable artifacts from local runtime state:

#### Durable and commit-friendly
- `memory/knowledge/`
- `memory/theory-fork/`
- `memory/devlog/`
- `openspec/changes/`
- selected architecture docs and handoffs

#### Local runtime and likely uncommitted
- Pi session files
- caches
- temporary evaluation snapshots
- local provider auth and machine-specific settings

## Module Plan

### 1) `aies/extensions/shared`
Purpose:
- shared types
- config loading
- path resolution
- common utilities
- event names and contracts

Must define:
- extension-safe shared helpers
- file path helpers for AIES directories
- schema validators where needed

This module should contain no policy.

### 2) `aies/extensions/heartbeat`
Purpose:
- represent AIES cycle cadence on top of Pi
- provide wake, inspect, and publish flow
- own cycle-state transitions

Likely Pi surfaces:
- `session_start`
- `before_agent_start`
- `turn_start`
- `turn_end`
- `agent_end`
- `appendEntry`

Initial behavior:
- lightweight cycle framing only
- no strict enforcement of focus
- emit cycle metadata for other modules

### 3) `aies/extensions/policy`
Purpose:
- inject AIES purpose and guidance into the active prompt
- enforce visible, minimal policy only
- keep early behavior loose and advisory

Likely Pi surfaces:
- `before_agent_start`
- prompt templates
- `APPEND_SYSTEM.md`

Initial behavior:
- remind the agent that self-evolution is the purpose
- ask for short rationale on chosen focus
- encourage balance without forcing exact weakest-dimension targeting

### 4) `aies/extensions/memory`
Purpose:
- manage lessons, decisions, patterns, devlog, and theory fork artifacts
- connect session history to durable memory writes

Likely Pi surfaces:
- `session_start`
- `agent_end`
- `appendEntry`
- custom commands and tools for memory inspection

Initial behavior:
- write only high-signal durable notes
- keep memory human-readable
- separate durable memory from ephemeral runtime state

### 5) `aies/extensions/openspec`
Purpose:
- keep long-horizon change continuity alive across sessions
- surface active change context into cycle selection

Likely Pi surfaces:
- `before_agent_start`
- commands for current change status
- file-based OpenSpec artifacts under `openspec/`

Initial behavior:
- identify active change
- summarize pending tasks
- surface blocked work without hard-locking the cycle to it

### 6) `aies/extensions/evaluation`
Purpose:
- compute observational LDI and drift/balance views
- publish suggestions, not hidden gates

Likely Pi surfaces:
- `turn_end`
- `agent_end`
- widgets and status output
- persisted entries for snapshot reconstruction

Initial behavior:
- generate observation snapshots
- call out weak and neglected areas
- avoid rejecting justified non-lowest-dimension work

### 7) `aies/extensions/operator-ui`
Purpose:
- expose AIES-specific state to the operator
- make policy and rationale visible

Likely Pi surfaces:
- `ctx.ui.setStatus(...)`
- `ctx.ui.setWidget(...)`
- custom message rendering
- later: web UI integration or RPC client

Initial behavior:
- show current cycle state
- show active focus and rationale
- show current OpenSpec item
- show evaluation summary and verification mode

### 8) `aies/extensions/verification`
Purpose:
- normalize how targeted, fast, and full verification modes are selected and recorded
- keep verification visible but proportionate

Likely Pi surfaces:
- commands
- tool wrappers if needed
- `agent_end`
- operator status/widgets

Initial behavior:
- classify verification mode
- record verification result alongside cycle summary
- avoid mandatory heavy verification for every slice

## Cross-Module Contracts
Define these early in `aies/contracts/`.

### `CycleState`
- cycle id
- session id
- current phase
- selected focus
- rationale
- active change id
- verification mode
- verification result
- timestamps

### `FocusDecision`
- chosen focus type
- justification
- alternatives considered
- linked dimension(s)
- linked OpenSpec change if any

### `EvaluationSnapshot`
- dimension scores or observational equivalents
- neglected dimensions
- drift markers
- balance summary
- recommendation text
- confidence

### `MemoryEvent`
- kind: lesson, decision, pattern, devlog, theory-note
- summary
- source evidence
- persistence target path

### `OpenSpecContext`
- active change id
- current task
- pending tasks
- blocked reasons
- stale status

### `VerificationRecord`
- mode: none, targeted, fast, full
- commands run
- result
- notable failures
- follow-up required

## Execution Model

### Cycle shape
The cycle model should remain:
1. Wake / inspect
2. Evaluate / orient
3. Choose focus
4. Plan / continue work
5. Implement
6. Verify
7. Reflect / log
8. Publish state

### Loose-control interpretation
At first this means:
- no module should silently veto reasonable work just because another focus scored lower
- evaluation should suggest and explain, not dominate
- OpenSpec continuity should be strong but not prison-like
- memory should inform context rather than flood it
- the agent should be encouraged to justify, not forced to obey hidden scoring logic

## Phase Plan

### Phase 0 - Workspace and Contracts
Objective:
- establish clean project structure and contracts before implementing behavior

Tasks:
- create `.pi/` project config surface
- create `aies/` module structure
- define shared contracts and path helpers
- define where durable memory, OpenSpec, and handoffs live
- create wrapper scripts or launch instructions for consistent local runs

Outputs:
- project-local Pi configuration
- extension module directories
- contract definitions
- handoff template

Exit criteria:
- AIES project structure exists without modifying Pi core
- a Pi run can discover project-local AIES resources cleanly

### Phase 1 - Pi Adoption Spike
Objective:
- prove that Pi can be the runtime substrate for AIES work

Tasks:
- confirm model/provider configuration path
- confirm tool and file-edit reliability
- confirm project-local resource discovery
- confirm extension load and reload path
- confirm a minimal custom extension can register commands, tools, status, and widgets

Outputs:
- minimal AIES test extension
- basic launch instructions
- operator-visible proof that AIES code is loading on Pi

Exit criteria:
- Pi runs against this project with AIES resources loaded
- extensions can publish status and respond to events

### Phase 2 - Thin AIES Control Shell
Objective:
- stand up the minimum AIES identity layer without over-controlling the agent

Tasks:
- implement `shared`, `heartbeat`, and `policy`
- publish cycle-state skeleton
- inject self-evolution framing at turn start
- capture chosen focus and rationale

Outputs:
- first real AIES-on-Pi cycle framing
- minimal cycle-state contract persisted between runs

Exit criteria:
- one cycle can run with visible AIES framing and recorded rationale
- no strict focus coercion exists yet

### Phase 3 - Memory and Reflection
Objective:
- restore durable identity and learning across sessions

Tasks:
- implement `memory` extension
- write devlog entries for meaningful cycles
- write durable memory entries only for high-signal lessons and decisions
- restore theory-fork support

Outputs:
- file-based memory layout
- session-to-memory write policy
- theory notes and devlog scaffolding

Exit criteria:
- restarting the system does not erase direction or lessons
- memory remains readable and selective rather than noisy

### Phase 4 - OpenSpec Continuity
Objective:
- restore long-horizon continuity without trapping every cycle inside it

Tasks:
- implement `openspec` extension
- detect or select active change
- summarize current work and blockers
- feed OpenSpec context into focus selection as advisory input

Outputs:
- active change summary
- task continuity support
- stale/blockage visibility

Exit criteria:
- multi-cycle work can resume coherently
- unfinished OpenSpec work is visible during orientation

### Phase 5 - Observational Evaluation
Objective:
- reintroduce LDI or successor evaluation as a compass, not a governor

Tasks:
- implement `evaluation` extension
- define scoring or observational dimensions
- compute drift and balance views
- surface recommendations and confidence
- record evaluation snapshots over time

Outputs:
- observational evaluation artifacts
- visible dimension and drift reporting

Exit criteria:
- evaluation is visible and useful
- justified non-lowest-dimension choices remain allowed

### Phase 6 - Operator Transparency
Objective:
- make AIES state understandable to a human operator in real time

Tasks:
- implement `operator-ui`
- add footer status and widgets in Pi
- add custom message rendering for AIES entries
- define later web UI integration path using Pi RPC or `AgentSession`

Outputs:
- in-terminal transparency surface
- clear mapping of future web UI requirements

Exit criteria:
- a human can see what cycle the system is in, why it chose its focus, and what happened

### Phase 7 - Active Cycle Runner
Objective:
- connect the existing AIES layers into one explicit runnable cycle

Tasks:
- implement `cycle-runner`
- synthesize one deterministic cycle prompt from current AIES state
- run one explicit cycle in the current session
- expose slash-command and operator-UI trigger paths for the same runner
- stop after one Pi turn with visible result and debt

Outputs:
- single-cycle execution command path
- cycle-runner status and timeline state
- explicit one-turn orchestration over heartbeat, OpenSpec, evaluation, verification, memory, and policy

Exit criteria:
- one explicit self-evolution cycle can be started on demand
- the cycle runs exactly one Pi turn and stops
- follow-up debt remains visible without auto-continuation

### Phase 8 - Verification and Recovery Edges
Objective:
- add only the minimum controls needed to keep work trustworthy

Tasks:
- implement `verification`
- classify verification modes by task type
- add visible recovery behavior for interrupted or partially failed cycles
- add targeted protections only where observed failures justify them

Outputs:
- verification records
- interruption and recovery strategy
- first evidence-based safety edges

Exit criteria:
- interrupted work is legible and recoverable
- verification is consistent and proportionate

### Phase 9 - Tighten Only Where Needed
Objective:
- harden the system selectively based on evidence from real runs

Tasks:
- review failure patterns
- add targeted constraints where drift or damage actually occurs
- keep all constraints visible in prompts, status, or logs
- avoid turning the system back into a rigid leash

Outputs:
- targeted control refinements
- documented reasons for each added constraint

Exit criteria:
- the system is more reliable without losing its early flexibility

### Phase 10 - Legacy Runtime Retirement
Objective:
- stop treating the legacy AIES runtime as an active dependency

Tasks:
- freeze legacy runtime work
- retain only archival and reference value
- move remaining conceptual assets into AIES v2 form

Outputs:
- explicit legacy retirement note
- reduced temptation to patch the old path further

Exit criteria:
- AIES v2 no longer depends on legacy execution internals

## Slice Planning Rules
To keep context compactable, each execution slice should be narrow.

### Preferred slice size
One slice should normally do exactly one of:
- introduce one extension module shell
- add one contract family
- add one operator surface
- add one persistence path
- add one verification behavior

### Avoid slices that
- implement multiple extension modules at once
- mix architecture decisions with broad feature delivery
- change both persistence layout and behavior model in the same pass
- add constraints before observability exists

## Context Compaction Protocol
Every completed slice should write a short handoff artifact under `handoffs/`.

### Handoff template
Each handoff should record:
- slice id and date
- goal
- files changed
- key decisions made
- verification performed
- known problems
- next recommended slice
- exact starting prompt for the next session if useful

### Compaction standard
If context must be compacted between sessions, preserve:
- current phase
- active change id
- last completed slice
- current extension module status
- unresolved questions
- verification status

Do not preserve:
- transient dead ends with no durable value
- repeated shell outputs unless they reveal a real constraint
- exploratory noise that did not change the plan

## Initial Step-by-Step Sequence

### Step 1
- create `.pi/settings.json`
- create `aies/` directory skeleton
- create `handoffs/` directory

### Step 2
- implement `aies/extensions/shared`
- define contracts for cycle, evaluation, memory, OpenSpec, and verification

### Step 3
- implement a minimal `operator-ui` proof that shows AIES is loaded
- confirm status and widget publication in Pi

### Step 4
- implement a minimal `policy` extension using `before_agent_start`
- inject self-evolution framing and rationale guidance only

### Step 5
- implement a minimal `heartbeat` extension
- create cycle-state skeleton and phase transitions

### Step 6
- implement the first memory write path for devlog and one durable lesson/decision flow

### Step 7
- implement OpenSpec context detection and active-change summary

### Step 8
- implement observational evaluation snapshots without coercive gating

### Step 9
- implement verification mode recording

### Step 10
- connect all of the above into one thin end-to-end cycle

## Verification Plan

### Phase 0-2 verification
- Pi loads AIES resources successfully
- extension commands work
- status and widget surfaces render
- cycle state persists between starts where intended

### Phase 3-5 verification
- durable memory files are written only when warranted
- OpenSpec context loads and is surfaced correctly
- evaluation snapshot is generated and visible

### Phase 6-8 verification
- operator can understand current state quickly
- interruption and recovery leave legible artifacts
- added controls are explainable and visible

### Acceptance verification
- one end-to-end self-evolution cycle completes on Pi
- one multi-cycle OpenSpec-backed improvement completes without legacy runtime involvement
- the system remains looser and more advisory than the prior harness unless evidence demands otherwise

## Known Risks
- accidentally letting AIES code drift into Pi internals too early
- recreating control rigidity through prompt text rather than explicit code
- writing too much low-signal memory and diluting continuity
- over-coupling extension modules through implicit side effects
- trying to build the web UI before the cycle contracts stabilize

## Risk Mitigations
- keep AIES code outside `pi-mono/` wherever possible
- require explicit contracts for cross-module data
- require visible rationale for added constraints
- use handoff artifacts to preserve only durable state between slices
- sequence UI polish after contract and continuity work

## Definition of Done
This migration is done when:
- AIES runs on Pi as a modular extension-based system
- the legacy execution runtime is no longer required
- cycle continuity, memory, OpenSpec, observational evaluation, and transparency all function together
- the system starts from guided autonomy and remains evidence-driven about any future tightening

## Immediate Next Action
Begin with `Phase 0 - Workspace and Contracts`.

The first implementation slice should create:
- `.pi/settings.json`
- `aies/contracts/`
- `aies/extensions/shared/`
- `aies/extensions/operator-ui/`
- `handoffs/`

That slice gives us the scaffolding needed to execute the rest of this plan one compact step at a time.
