param(
  [Parameter(Mandatory = $true)]
  [string]$RunPath,
  [switch]$RemoveBranch,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([string[]]$Arguments)
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed"
  }
}

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$resolvedRunPath = [System.IO.Path]::GetFullPath($RunPath)
$normalizedRunPath = $resolvedRunPath.Replace('\', '/')

if (-not (Test-Path $resolvedRunPath)) {
  throw "Run path does not exist: $resolvedRunPath"
}

$worktreeInfo = git worktree list --porcelain
if ($LASTEXITCODE -ne 0) {
  throw "Failed to inspect worktree list."
}

$blocks = ($worktreeInfo -split "`r?`n`r?`n") | Where-Object { $_.Trim() }
$matchingBlock = $blocks | Where-Object { $_ -match [regex]::Escape("worktree $normalizedRunPath") } | Select-Object -First 1
if (-not $matchingBlock) {
  throw "$resolvedRunPath is not a registered git worktree for this repo."
}

$branchName = $null
$branchOutput = git -C $resolvedRunPath branch --show-current
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($branchOutput)) {
  $branchName = $branchOutput.Trim()
}

if (-not $Force) {
  $status = git -C $resolvedRunPath status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect run worktree status."
  }
  if (-not [string]::IsNullOrWhiteSpace($status)) {
    throw "Run worktree is dirty: $resolvedRunPath. Commit, stash, or rerun with -Force if you intend to remove it anyway."
  }
}

Write-Host "Removing worktree registration for $resolvedRunPath..."
if ($Force) {
  Invoke-Git -Arguments @("worktree", "remove", "--force", $resolvedRunPath)
} else {
  Invoke-Git -Arguments @("worktree", "remove", $resolvedRunPath)
}

if ($RemoveBranch -and $branchName) {
  Write-Host "Removing branch $branchName..."
  if ($Force) {
    Invoke-Git -Arguments @("branch", "-D", $branchName)
  } else {
    Invoke-Git -Arguments @("branch", "-d", $branchName)
  }
}

Write-Host "Removed run worktree: $resolvedRunPath"
