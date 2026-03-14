param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PiArgs
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$piMonoRoot = if ($env:AIES_PI_MONO_ROOT) { $env:AIES_PI_MONO_ROOT } else { Join-Path $projectRoot "pi-mono" }
$tsxCli = Join-Path $piMonoRoot "node_modules\tsx\dist\cli.mjs"
$piCli = Join-Path $piMonoRoot "packages\coding-agent\src\cli.ts"
$tsconfigPath = Join-Path $piMonoRoot "tsconfig.json"

$piMonoRoot = [System.IO.Path]::GetFullPath($piMonoRoot)

if (-not (Test-Path $tsxCli)) {
    throw "Missing tsx runtime at $tsxCli. Set AIES_PI_MONO_ROOT or run npm install in pi-mono first."
}

if (-not (Test-Path $piCli)) {
    throw "Missing Pi CLI source at $piCli. Check AIES_PI_MONO_ROOT or local pi-mono checkout."
}

if (-not (Test-Path $tsconfigPath)) {
    throw "Missing Pi TypeScript config at $tsconfigPath. Check AIES_PI_MONO_ROOT or local pi-mono checkout."
}

Push-Location $projectRoot
try {
    Write-Host "Using Pi-Mono root: $piMonoRoot"
    & node $tsxCli --tsconfig $tsconfigPath $piCli @PiArgs
}
finally {
    Pop-Location
}
