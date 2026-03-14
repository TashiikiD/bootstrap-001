param(
  [string]$Name,
  [string]$RunsRoot = "E:\Coding\AIES-runs",
  [string]$PiMonoSource,
  [switch]$UseSharedPiMono,
  [switch]$SkipMainRepoCleanCheck,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TimestampSlug {
  return (Get-Date).ToString("yyyyMMdd-HHmmss")
}

function Get-SafeRunName([string]$Value) {
  $raw = if ([string]::IsNullOrWhiteSpace($Value)) { "bootstrap-$(Get-TimestampSlug)" } else { $Value.Trim() }
  $safe = $raw.ToLower() -replace "[^a-z0-9._-]+", "-"
  $safe = $safe.Trim("-")
  if ([string]::IsNullOrWhiteSpace($safe)) {
    throw "Run name resolved to empty. Provide a name with letters or numbers."
  }
  return $safe
}

function Invoke-Git {
  param([string[]]$Arguments)
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed"
  }
}

function New-ShortcutFile {
  param(
    [string]$ShortcutPath,
    [string]$TargetPath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [string]$IconLocation
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  if ($IconLocation -and (Test-Path $IconLocation)) {
    $shortcut.IconLocation = "$IconLocation,0"
  }
  $shortcut.Save()
}

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$piMonoLocal = Join-Path $projectRoot "pi-mono"
$resolvedRunsRoot = [System.IO.Path]::GetFullPath($RunsRoot)
$runName = Get-SafeRunName $Name
$worktreePath = Join-Path $resolvedRunsRoot $runName
$branchName = "codex/run-$runName"

if (Test-Path $worktreePath) {
  if (-not $Force) {
    throw "Run worktree already exists at $worktreePath. Use -Force only if you have removed it intentionally."
  }
}

if (-not (Test-Path $resolvedRunsRoot)) {
  New-Item -ItemType Directory -Path $resolvedRunsRoot | Out-Null
}

$status = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw "Failed to inspect git status."
}
if (-not $SkipMainRepoCleanCheck -and -not [string]::IsNullOrWhiteSpace($status)) {
  throw "Main repo is not clean. Commit or stash changes before creating a run worktree, or use -SkipMainRepoCleanCheck for an intentional local smoke test."
}
if ($SkipMainRepoCleanCheck -and -not [string]::IsNullOrWhiteSpace($status)) {
  Write-Warning "Skipping clean-check while the main repo has uncommitted changes. The run worktree will still be created from HEAD."
}

$existingBranch = git branch --list $branchName
if ($LASTEXITCODE -ne 0) {
  throw "Failed to inspect existing branches."
}
if (-not [string]::IsNullOrWhiteSpace($existingBranch)) {
  throw "Branch $branchName already exists. Remove it or choose a different run name."
}

Write-Host "Creating worktree $worktreePath on branch $branchName..."
Invoke-Git -Arguments @("worktree", "add", "-b", $branchName, $worktreePath, "HEAD")

$resolvedPiSource = $null
if ($UseSharedPiMono) {
  $resolvedPiSource = if ($PiMonoSource) { [System.IO.Path]::GetFullPath($PiMonoSource) } else { [System.IO.Path]::GetFullPath($piMonoLocal) }
  if (-not (Test-Path $resolvedPiSource)) {
    throw "Shared Pi-Mono source not found at $resolvedPiSource"
  }
} else {
  $resolvedPiSource = if ($PiMonoSource) { [System.IO.Path]::GetFullPath($PiMonoSource) } else { [System.IO.Path]::GetFullPath($piMonoLocal) }
  if (-not (Test-Path $resolvedPiSource)) {
    throw "Pi-Mono source not found at $resolvedPiSource"
  }

  $targetPiMono = Join-Path $worktreePath "pi-mono"
  Write-Host "Cloning Pi-Mono into $targetPiMono..."
  & git clone $resolvedPiSource $targetPiMono
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to clone Pi-Mono into run worktree."
  }
}

$runtimeRoot = Join-Path $worktreePath ".aies-runtime"
if (-not (Test-Path $runtimeRoot)) {
  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
}

$sessionRoot = Join-Path $runtimeRoot "sessions"
if (-not (Test-Path $sessionRoot)) {
  New-Item -ItemType Directory -Path $sessionRoot | Out-Null
}

$operatorRuntimeRoot = Join-Path $runtimeRoot "operator-ui"
if (-not (Test-Path $operatorRuntimeRoot)) {
  New-Item -ItemType Directory -Path $operatorRuntimeRoot | Out-Null
}

$launchFile = Join-Path $worktreePath "run-env.ps1"
$piRootForEnv = if ($UseSharedPiMono) { $resolvedPiSource } else { Join-Path $worktreePath "pi-mono" }
$launchContent = @(
  "`$env:AIES_PI_MONO_ROOT = '$piRootForEnv'",
  "Set-Location '$worktreePath'",
  "Write-Host 'AIES run environment loaded.'",
  "Write-Host 'Worktree: $worktreePath'",
  "Write-Host 'Pi-Mono: $piRootForEnv'"
) -join [Environment]::NewLine
Set-Content -Path $launchFile -Value $launchContent -Encoding UTF8

$iconSource = Join-Path $projectRoot "launcher-assets\aies-run-launcher.ico"
$iconPngSource = Join-Path $projectRoot "launcher-assets\aies-run-launcher.png"
$iconTarget = Join-Path $worktreePath "aies-run-launcher.ico"
$iconPngTarget = Join-Path $worktreePath "aies-run-launcher.png"
if (Test-Path $iconSource) {
  Copy-Item $iconSource $iconTarget -Force
}
if (Test-Path $iconPngSource) {
  Copy-Item $iconPngSource $iconPngTarget -Force
}

$wtLauncherPath = Join-Path $worktreePath "launch-aies-run.ps1"
$wtLauncherCmdPath = Join-Path $worktreePath "launch-aies-run.cmd"
$wtLauncherContent = @"
param(
  [switch]`$DryRun
)

`$ErrorActionPreference = 'Stop'
`$runRoot = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$runEnv = Join-Path `$runRoot 'run-env.ps1'
`$piScript = Join-Path `$runRoot 'run-aies-on-pi.ps1'
`$uiScript = Join-Path `$runRoot 'run-operator-ui.ps1'
`$uiUrl = 'http://127.0.0.1:4321'
`$wtCommand = Get-Command wt -ErrorAction SilentlyContinue

if (-not `$wtCommand) {
  throw 'Windows Terminal (wt) was not found on PATH.'
}

`$tuiCommand = "& '`$runEnv'; & '`$piScript'"
`$cliCommand = "& '`$runEnv'; Write-Host 'AIES CLI shell ready.'; Write-Host 'Useful commands: /cycle-run, /cycle-status, /verification-plan, /recovery-status';"
`$webUiCommand = "& '`$runEnv'; & '`$uiScript' -Mode dev"

if (`$DryRun) {
  Write-Host 'Dry run only. Planned actions:'
  Write-Host "  Web UI process: powershell -NoExit -ExecutionPolicy Bypass -Command `$webUiCommand"
  Write-Host "  Browser URL: `$uiUrl"
  Write-Host "  WT tab 1 (TUI): `$tuiCommand"
  Write-Host "  WT tab 2 (CLI): `$cliCommand"
  return
}

Start-Process -FilePath 'powershell.exe' -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `$webUiCommand
) | Out-Null

Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  "Start-Sleep -Seconds 4; Start-Process '`$uiUrl'"
) | Out-Null

Start-Process -FilePath `$wtCommand.Source -ArgumentList @(
  'new-tab',
  '--title',
  'AIES TUI - $runName',
  'powershell',
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `$tuiCommand,
  ';',
  'new-tab',
  '--title',
  'AIES CLI - $runName',
  'powershell',
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `$cliCommand
) | Out-Null
"@
Set-Content -Path $wtLauncherPath -Value $wtLauncherContent -Encoding UTF8

$wtLauncherCmdContent = @(
  '@echo off',
  'powershell.exe -ExecutionPolicy Bypass -File "%~dp0launch-aies-run.ps1" %*'
) -join [Environment]::NewLine
Set-Content -Path $wtLauncherCmdPath -Value $wtLauncherCmdContent -Encoding ASCII

$powershellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcutName = "AIES $runName.lnk"
$runShortcutPath = Join-Path $worktreePath $shortcutName
$desktopPath = [Environment]::GetFolderPath('Desktop')
$desktopShortcutPath = if ($desktopPath) { Join-Path $desktopPath $shortcutName } else { $null }
$shortcutArguments = "-ExecutionPolicy Bypass -File `"$wtLauncherPath`""

New-ShortcutFile -ShortcutPath $runShortcutPath -TargetPath $powershellExe -Arguments $shortcutArguments -WorkingDirectory $worktreePath -IconLocation $iconTarget
if ($desktopShortcutPath) {
  New-ShortcutFile -ShortcutPath $desktopShortcutPath -TargetPath $powershellExe -Arguments $shortcutArguments -WorkingDirectory $worktreePath -IconLocation $iconTarget
}

Write-Host ""
Write-Host "Run worktree ready."
Write-Host "Worktree: $worktreePath"
Write-Host "Branch:   $branchName"
Write-Host "Pi-Mono:  $piRootForEnv"
Write-Host "Launcher: $wtLauncherPath"
Write-Host "Shortcut: $runShortcutPath"
if ($desktopShortcutPath) {
  Write-Host "Desktop:  $desktopShortcutPath"
}
Write-Host ""
Write-Host "Next commands:"
Write-Host "  powershell -NoExit -ExecutionPolicy Bypass -File '$launchFile'"
Write-Host "  .\launch-aies-run.ps1"
Write-Host "  .\run-aies-on-pi.ps1 --help"
Write-Host "  .\run-operator-ui.ps1 -Mode dev"
