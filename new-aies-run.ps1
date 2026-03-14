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

Write-Host ""
Write-Host "Run worktree ready."
Write-Host "Worktree: $worktreePath"
Write-Host "Branch:   $branchName"
Write-Host "Pi-Mono:  $piRootForEnv"
Write-Host ""
Write-Host "Next commands:"
Write-Host "  powershell -NoExit -ExecutionPolicy Bypass -File '$launchFile'"
Write-Host "  .\run-aies-on-pi.ps1 --help"
Write-Host "  .\run-operator-ui.ps1 -Mode dev"
