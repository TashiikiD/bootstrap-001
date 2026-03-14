# Architecture

## Purpose

This repository is a self-contained AIES v2 bootstrap run. It combines:

- A project-local AIES configuration and extension layer under `aies/`
- A lightweight operator console under `operator-ui/`
- Durable run artifacts and working state under `memory/`, `openspec/`, `handoffs/`, and `.aies-runtime/`
- PowerShell launchers that start the local run surfaces together

The bootstrap is designed to sit on top of a `pi-mono` execution core rather than replace it. The local code in this repo configures, observes, and steers that core for this run shape.

## Open First

If you need to understand the repo quickly, start here:

- `aies/config.json` — canonical run-level configuration: project name, runtime roots, and execution core
- `aies/extensions/shared/paths.ts` — canonical path map for runtime, memory, OpenSpec, prompts, skills, and handoffs
- `operator-ui/server/index.ts` — HTTP API and static-server entrypoint for the operator console
- `operator-ui/server/lib.ts` — runtime state, session parsing, timeline generation, and `pi-mono` execution bridge
- `operator-ui/src/main.ts` — Lit frontend that drives the operator console
- `run-operator-ui.ps1` and `launch-aies-run.ps1` — local entrypoints for running the system

## System Shape

| Path | Role | Open when |
| --- | --- | --- |
| `aies/` | Project-local AIES layer for configuration, contracts, prompts, skills, and runtime extensions. | You are changing AIES behavior or adding run-local capabilities. |
| `aies/extensions/shared/` | Shared config, paths, and message keys used across extensions. | You need the stable wiring points or filesystem layout. |
| `aies/extensions/cycle-runner/` | Cycle orchestration state and commands. | You are changing how guided cycles are triggered, resumed, or aborted. |
| `aies/extensions/heartbeat/` | Focus inference and heartbeat state. | You are changing how session progress or focus is inferred. |
| `aies/extensions/memory/` | Memory-oriented commands and state integration. | You are changing durable memory handling. |
| `aies/extensions/openspec/` | OpenSpec status and change-tracking integration. | You are changing planning or spec-state visibility. |
| `aies/extensions/policy/` | Policy mode types, prompts, and state. | You are changing control policy behavior. |
| `aies/extensions/verification/` | Verification mode, recovery actions, and follow-up commands. | You are changing verification or recovery workflows. |
| `aies/extensions/operator-ui/` | Small bootstrap extension that exposes run status in the Pi UI. | You are changing the in-agent bootstrap status widget. |
| `operator-ui/src/` | Lit frontend for the operator console. | You are changing console UX, panel rendering, or client actions. |
| `operator-ui/server/` | Node HTTP backend serving state, timeline, actions, and control mutations. | You are changing backend APIs or the bridge into runtime state. |
| `.aies-runtime/` | Generated runtime state, sessions, and operator UI control files. | You are debugging live run state or session history. |
| `memory/` | Human-readable durable memory: knowledge, theory fork, and devlog. | You are reviewing or changing persistent memory artifacts. |
| `openspec/` | Canonical AIES planning root for this run. | You are editing change plans or checking current spec state. |
| `handoffs/` | Handoff artifacts and templates. | You are preparing or consuming execution handoffs. |
| `docs/foundations/` | Higher-level reference material about the AI-human stack. | You need conceptual context rather than executable wiring. |

## Important Boundaries

- `aies/config.json` is the repo’s canonical runtime configuration, and `aies/extensions/shared/config.ts` / `aies/extensions/shared/paths.ts` turn that into code-facing paths and names. Keep path or root changes aligned across those files.
- `aies/contracts/` is intended for stable internal contracts only. Keep serialization-friendly shapes there and avoid embedding runtime policy logic.
- `operator-ui/` is an observer-controller surface, not the execution core. It reads sessions and memory, mutates local control files, and shells out to `pi-mono` when it needs actual execution.
- `operator-ui/server/lib.ts` is the main bridge between UI actions and persisted run state. It owns `.aies-runtime/operator-ui`, session discovery under `.aies-runtime/sessions`, and process invocation of the upstream CLI.
- `.aies-runtime/` is generated state. Prefer changing the code that writes it rather than hand-editing files unless you are doing targeted recovery.
- `openspec/` in this repo is canonical for AIES planning. The upstream `pi-mono/openspec` tree is reference material, not the primary planning root for this run.
- `pi-mono` is an external sibling dependency expected by the launch scripts and operator backend. This repo configures and drives it, but does not define its internals.

## Runtime Flow

1. A launcher script starts the local surfaces.
2. Shared path/config helpers resolve the run’s filesystem roots.
3. AIES extensions register commands and state hooks into the upstream agent runtime.
4. The operator UI backend reads `.aies-runtime/sessions`, `memory/`, and `openspec/changes` to build operator state.
5. The Lit frontend fetches `/api/state` and related endpoints, then posts control mutations back to the backend.
6. When a control action requires execution, the backend shells into `pi-mono` via `tsx` and the coding-agent CLI.
7. Results are persisted back into runtime state, actions, and timeline material for the next UI refresh.

## Common Change Paths

- Add a new operator control: update `operator-ui/src/main.ts`, add or extend the matching endpoint in `operator-ui/server/index.ts`, then persist or derive the backing state in `operator-ui/server/lib.ts`.
- Change runtime roots or naming: update `aies/config.json`, then verify `aies/extensions/shared/paths.ts`, `run-operator-ui.ps1`, and `operator-ui/server/lib.ts` still agree.
- Add a new AIES behavioral slice: place the logic in a focused `aies/extensions/<slice>/` module, keep shared types or path rules in `shared/` or `contracts/`, and expose only the minimal command/state surface needed.
- Change verification or recovery behavior: start in `aies/extensions/verification/`, then update the operator UI endpoints and frontend controls only if the operator surface must expose the new behavior.
- Change heartbeat, cycle, memory, or OpenSpec summaries shown to operators: adjust the relevant extension state producers first, then update `operator-ui/server/lib.ts` timeline/state shaping if the UI model must change.

## Entrypoints

- `launch-aies-run.ps1` opens the combined local run experience: web UI, browser, TUI, and CLI.
- `run-operator-ui.ps1` is the main operator-console launcher for install, build, frontend, backend, or combined dev modes.
- `operator-ui/server/index.ts` starts the backend server on `AIES_OPERATOR_UI_PORT` or `4320` by default.
- `operator-ui/src/main.ts` mounts the operator console application in the browser.
- `aies/extensions/*/index.ts` files register project-local commands and hooks into the upstream agent runtime.

## Source Docs

- `openspec/README.md` explains why this repo’s `openspec/` tree is canonical for AIES changes.
- `memory/README.md` describes the durable memory layout.
- `aies/contracts/README.md`, `aies/prompts/README.md`, and `aies/skills/README.md` document the intended role of those local extension surfaces.
- `docs/foundations/AI-Human-Stack-Component-Reference-Map.md` and `docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md` provide broader conceptual context.
