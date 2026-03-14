param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PiArgs
)

$ErrorActionPreference = 'Stop'
$runRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$powershellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launchTuiScript = Join-Path $runRoot 'launch-aies-tui.ps1'

if (-not (Test-Path $powershellExe)) {
  throw "powershell.exe was not found at $powershellExe"
}

if (-not (Test-Path $launchTuiScript)) {
  throw "launch-aies-tui.ps1 was not found at $launchTuiScript"
}

$argumentList = @(
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  $launchTuiScript
) + $PiArgs

$process = Start-Process -FilePath $powershellExe -ArgumentList $argumentList -PassThru
Write-Output ($process.Id)
