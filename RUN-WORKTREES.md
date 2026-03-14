# AIES Run Worktrees

Use run worktrees for any live autonomous cycle experimentation.

## Why

Phase 7+ cycles can make legitimate repo edits. A run worktree keeps those edits out of `E:\Coding\AIESv2`.

## Create a run

From `E:\Coding\AIESv2`:

```powershell
.\new-aies-run.ps1 -Name bootstrap-001
```

This creates:

- worktree at `E:\Coding\AIES-runs\bootstrap-001`
- branch `codex/run-bootstrap-001`
- isolated `.aies-runtime\`
- `run-env.ps1` helper inside the run
- a cloned `pi-mono` inside the run by default

The default path requires the main repo to be clean so the run is created from an intentional committed state.

For local smoke tests only, you can bypass that check:

```powershell
.\new-aies-run.ps1 -Name bootstrap-smoke -UseSharedPiMono -SkipMainRepoCleanCheck
```

That still creates the run from `HEAD`, not from uncommitted working-copy changes.

## Use a shared Pi checkout

If you do not want to clone `pi-mono` into every run:

```powershell
.\new-aies-run.ps1 -Name bootstrap-001 -UseSharedPiMono -PiMonoSource E:\Coding\AIESv2\pi-mono
```

That writes `AIES_PI_MONO_ROOT` into the run environment so the run scripts target the shared checkout.

## Enter the run

```powershell
powershell -NoExit -ExecutionPolicy Bypass -File E:\Coding\AIES-runs\bootstrap-001\run-env.ps1
```

Then run:

```powershell
.\run-aies-on-pi.ps1
.\run-operator-ui.ps1 -Mode dev
```

## Remove a run

From the main repo:

```powershell
.\remove-aies-run.ps1 -RunPath E:\Coding\AIES-runs\bootstrap-001 -RemoveBranch
```

Use `-Force` only if the run worktree is intentionally dirty and you are discarding it.

## Defaults

- main repo must be clean before creating a run worktree
- branch names use the `codex/` prefix
- runtime state remains local to the run worktree
- autonomous cycles should run from a worktree, not from main
