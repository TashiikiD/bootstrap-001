# Run AIES on Pi

Use the root wrapper so Pi starts with the current AIES repo as the working directory and picks up the AIES root overlay.

The wrapper supports two Pi-Mono layouts:

- local checkout at `<repo>\pi-mono`
- shared external checkout via `AIES_PI_MONO_ROOT`

## Interactive

```powershell
.\run-aies-on-pi.ps1
```

## Shared Pi-Mono checkout

```powershell
$env:AIES_PI_MONO_ROOT = 'E:\Coding\AIESv2\pi-mono'
.\run-aies-on-pi.ps1
```

## Wrapper smoke test

```powershell
.\run-aies-on-pi.ps1 --help
```

## After model configuration

Once a provider/model is configured, start Pi from the AIES root and confirm:
- interactive startup shows the AIES bootstrap status/widget
- `/aies-paths` is available
- `/aies-status` is available

## Recommended run isolation

Do not run autonomous cycles from the main worktree.

Create an isolated run worktree first:

```powershell
.\new-aies-run.ps1 -Name bootstrap-001
```

Then enter the run and load its environment:

```powershell
powershell -NoExit -ExecutionPolicy Bypass -File E:\Coding\AIES-runs\bootstrap-001\run-env.ps1
```

That keeps:

- code edits inside the run worktree
- `.aies-runtime\` isolated per run
- operator UI state isolated per run

Remove a completed run with:

```powershell
.\remove-aies-run.ps1 -RunPath E:\Coding\AIES-runs\bootstrap-001 -RemoveBranch
```
