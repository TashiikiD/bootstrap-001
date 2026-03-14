param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PiArgs
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$piMonoRoot = Join-Path $projectRoot "pi-mono"
$tsxCli = Join-Path $piMonoRoot "node_modules\tsx\dist\cli.mjs"
$piCli = Join-Path $piMonoRoot "packages\coding-agent\src\cli.ts"
$tsconfigPath = Join-Path $piMonoRoot "tsconfig.json"

if (-not (Test-Path $tsxCli)) {
    throw "Missing tsx runtime at $tsxCli. Run npm install in pi-mono first."
}

if (-not (Test-Path $piCli)) {
    throw "Missing Pi CLI source at $piCli."
}

if (-not (Test-Path $tsconfigPath)) {
    throw "Missing Pi TypeScript config at $tsconfigPath."
}

Push-Location $projectRoot
try {
    & node $tsxCli --tsconfig $tsconfigPath $piCli @PiArgs
}
finally {
    Pop-Location
}
