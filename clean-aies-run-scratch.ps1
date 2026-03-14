param(
  [string]$RunRoot = (Get-Location).Path,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $RunRoot)) {
  throw "Run root does not exist: $RunRoot"
}

$patterns = @(
  '.*_out.txt',
  '.*_files.txt',
  '.grep_*.txt',
  '.rg_*.txt'
)

$items = foreach ($pattern in $patterns) {
  Get-ChildItem -Path $RunRoot -File -Filter $pattern -Force -ErrorAction SilentlyContinue
}

$targets = $items | Sort-Object FullName -Unique

if (-not $targets -or $targets.Count -eq 0) {
  Write-Host "No scratch artifacts found in $RunRoot"
  return
}

Write-Host "Scratch artifacts in ${RunRoot}:"
$targets | ForEach-Object { Write-Host " - $($_.Name)" }

if ($WhatIf) {
  Write-Host 'WhatIf set; no files removed.'
  return
}

$targets | Remove-Item -Force
Write-Host "Removed $($targets.Count) scratch artifact(s)."
