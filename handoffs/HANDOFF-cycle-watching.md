# Handoff: Watching AIES Agent Cycles

## What This Is

AIES v2 bootstrap-001 is a **self-evolving AI agent** built on the Pi coding-agent framework. It runs in autonomous cycles where it reads its own state, decides what to work on, executes changes, and evaluates itself. Your job as a cycle-watcher is to:

1. Launch cycles
2. Watch what the agent does
3. Review and commit (or revert) its changes
4. Intervene when it goes off the rails

The agent lives in a git worktree at `E:\Coding\AIES-runs\bootstrap-001` on branch `codex/run-bootstrap-001`, forked from the main AIESv2 repo.

---

## Prerequisites

- **Pi-Mono**: The Pi coding agent runtime must be installed at `E:\Coding\AIESv2\pi-mono` (or set `$env:AIES_PI_MONO_ROOT`). It needs `npm install` done.
- **Node.js**: Required for tsx/Pi runtime.
- **PowerShell**: All launcher scripts are PS1. Run with `-ExecutionPolicy Bypass`.
- **Working directory**: Always `E:\Coding\AIES-runs\bootstrap-001`.

---

## How to Launch a Cycle

### Option A: Full launch (TUI + CLI + WebUI)
```powershell
cd E:\Coding\AIES-runs\bootstrap-001
.\launch-aies-run.ps1
```
This opens 3 windows: TUI (the active agent session), CLI (interactive shell), and WebUI (operator dashboard at http://127.0.0.1:4320).

### Option B: Single TUI session (simplest)
```powershell
cd E:\Coding\AIES-runs\bootstrap-001
.\launch-aies-tui.ps1
```
This starts one Pi agent session. The agent loads AGENTS.md and its extensions, then waits for input.

### Option C: Direct Pi invocation
```powershell
cd E:\Coding\AIES-runs\bootstrap-001
.\run-aies-on-pi.ps1
```

### Starting a cycle inside the session
Once the Pi agent is running, type:
```
/cycle-run
```
The agent will autonomously: scan its state, pick a focus, execute work, and produce a summary. One cycle = one turn of autonomous work.

### Checking status without running a cycle
```
/cycle-status
```

---

## What to Watch For

### Normal behavior
- Agent picks a focus type (e.g., `capability_expansion`, `active_change_continuation`, `weak_dimension_improvement`)
- Makes code changes, writes devlogs, updates theory-fork notes
- Produces commits with messages like `Add audit radar evidence scanner (run <session-id>)`
- Runs `.\verify-aies-quick.ps1` to self-check

### Red flags requiring intervention

| Signal | What happened | What to do |
|--------|--------------|------------|
| **Hang on PowerShell command** | Agent created a script that spawns a child Pi session (recursive cycle). The hard constraint in `policy/prompt.ts` should prevent this now, but watch for it. | Kill the process. Revert the script. Check `git diff` for what it created. |
| **Multiple small maintenance cycles** | Agent is stuck in conservative loop (fixing verification state, tweaking configs). The anti-conservatism changes in commit `9045304` should reduce this. | Review what it's doing. If it's genuinely useful, let it continue. If it's churning, consider prompting it with a specific direction. |
| **Creates files outside repo root** | Redline violation. | Revert immediately. |
| **Modifies unrelated files** | Scope creep. | Revert the unrelated changes, keep the relevant ones. |
| **Metric farming** | Agent creates work just to satisfy its own evaluation system (e.g., writing empty theory-fork entries, creating dummy tools). | Revert. This is a known anti-pattern the prompt warns against. |
| **waitForSessionIdle or similar custom wait** | Agent replaces framework primitives with its own implementations. Last time this contributed to a hang. | Revert to `ctx.waitForIdle()`. |

---

## Post-Cycle Review Workflow

After each cycle completes:

### 1. Check what changed
```bash
git status
git diff
git diff --stat
```

### 2. Evaluate the changes
- **Code changes** (`aies/extensions/`, `operator-ui/`): Do they compile? Are they reasonable? Run `.\verify-aies-quick.ps1`.
- **Memory/devlog** (`memory/devlog/`, `memory/theory-fork/`): Are the notes coherent and honest?
- **OpenSpec** (`openspec/changes/`): Is the proposed plan reasonable?
- **New scripts** (repo root `*.ps1`): Does anything spawn child processes or call `run-aies-on-pi.ps1`? If so, **delete it**.

### 3. Commit or revert
```bash
# If changes look good:
git add <specific-files>
git commit -m "description (run <session-id>)"

# If changes are problematic:
git checkout -- <file>           # revert specific file
git checkout -- .                # revert everything
```

### 4. Check for new session files
```bash
ls .aies-runtime/sessions/
```
Session files are JSONL transcripts. The filename is `<timestamp>_<uuid>.jsonl`. You can read them to understand what the agent did in detail.

---

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | The agent's core instructions. Edit this to change its behavior. |
| `aies/extensions/policy/prompt.ts` | Policy prompt injected into every cycle. Contains the hard constraint against recursive sessions. |
| `aies/extensions/cycle-runner/index.ts` | The cycle runner - orchestrates scan/assess/execute/evaluate. ~800 lines. |
| `aies/extensions/evaluation/index.ts` | Self-evaluation system. Scores the agent's work across 7 dimensions. |
| `memory/knowledge/intent-hierarchy.yaml` | Priority ordering for what the agent should focus on. |
| `memory/knowledge/coherence-charter.yaml` | Defines what "coherent" behavior looks like. |
| `openspec/changes/` | Active and proposed multi-cycle plans. |
| `memory/devlog/` | Agent's own notes about what it did and why. |
| `memory/theory-fork/` | Agent's evolving understanding of AIES theory. |
| `verify-aies-quick.ps1` | Build + typecheck + smoke test. Run this after code changes. |
| `.aies-runtime/sessions/` | Session transcript files (JSONL). |

---

## Architecture in Brief

The agent has 7 self-assessed dimensions:
- **Prompt**: How well it uses/shapes its own prompts
- **Context**: How well it understands and preserves context across cycles
- **Intent**: How well it forms and follows through on goals
- **Judgment**: Quality of its decisions about what to work on
- **Coherence**: Consistency of behavior across cycles
- **Evaluation**: Quality of its self-assessment
- **Harness**: How well the surrounding infrastructure supports its evolution

Each cycle, the evaluation system scores these dimensions, identifies neglected areas, and suggests focus. The agent then picks what to work on.

---

## Recent History (as of 2026-03-15)

### Commit `9045304` — Anti-conservatism overhaul
We changed 8 interlocking mechanisms that were keeping the agent in a conservative maintenance loop. Added 4 new focus types (`capability_expansion`, `proactive_exploration`, `tool_creation`, `theory_experiment`), rebalanced the intent hierarchy, restructured prompts to lead with aspiration.

### Commits `12e3a9f` through `c543fd6` — Audit Radar
After the anti-conservatism changes, the agent built a full self-audit pipeline over multiple cycles: evidence scanner, layer assessor, drift tracker, proposal generator, reconciliation bridge, outcome comparator, cycle-runner integration. This was genuinely ambitious work.

### The hang incident
The agent created `verify-aies-cycle-runner-audit.ps1` which spawned a child Pi session to prove its audit hook worked. This caused the cycle to hang for 20+ minutes. We:
- Reverted the custom `waitForSessionIdle` implementation
- Deleted the recursive verification script
- Added a hard constraint to `policy/prompt.ts` preventing recursive session spawning

### Current uncommitted changes
There are 4 uncommitted files from the last agent session (audit-radar WebUI integration). Review them before running the next cycle.

---

## Common Operations

### Run verification
```powershell
.\verify-aies-quick.ps1
```

### View recent agent commits
```bash
git log --oneline -20
```

### View what a specific cycle did
```bash
# Find commits from a specific session:
git log --oneline --all --grep="<session-id-prefix>"
```

### Reset agent to clean state
```bash
git status                    # see what's dirty
git diff                      # review changes
git checkout -- .             # revert all uncommitted changes (destructive!)
```

### Force a specific focus
In the Pi session, instead of `/cycle-run`, you can give the agent a direct instruction:
```
Create a new tool that does X
```
Or use the cycle-run with a hint:
```
/cycle-run --source operator_ui
```

---

## Known Issues

- **WebUI audit radar visibility**: The operator-ui may need a restart to pick up new audit radar endpoints. The uncommitted changes in `operator-ui/` add this integration.
- **Evaluation dimension**: The agent's own evaluation layer is the weakest dimension. It tends to score itself generously.
- **Session file growth**: JSONL session files can get large. They're gitignored but accumulate on disk.

---

## Safety Rails

These are already in place:
1. **Redlines in AGENTS.md**: No operations outside repo root, no destructive delete commands, no hidden control state.
2. **Hard constraint in policy/prompt.ts**: No spawning child Pi/agent sessions. No recursive cycle-within-cycle.
3. **Operator review**: The agent commits but doesn't push. You review every commit before it reaches `main`.
4. **Verification system**: `verify-aies-quick.ps1` catches build/type errors.
5. **Single-session linear format**: Each cycle runs in exactly one Pi session. No sub-agent sprawl.
