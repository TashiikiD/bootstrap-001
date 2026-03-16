$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultPiMonoRoot = 'E:\Coding\AIESv2\pi-mono'

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host "==> $Label" -ForegroundColor Cyan
    & $Action
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$FilePath,
        [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
        [string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $renderedArguments = if ($Arguments.Count -gt 0) {
            ' ' + ($Arguments -join ' ')
        }
        else {
            ''
        }

        throw "External command failed with exit code ${exitCode}: $FilePath$renderedArguments"
    }
}

if (-not $env:AIES_PI_MONO_ROOT -and (Test-Path $defaultPiMonoRoot)) {
    $env:AIES_PI_MONO_ROOT = $defaultPiMonoRoot
    Write-Host "Using fallback AIES_PI_MONO_ROOT: $defaultPiMonoRoot" -ForegroundColor DarkGray
}

Invoke-Step -Label 'operator-ui build' -Action {
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npm run build
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'operator-ui typecheck' -Action {
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npx tsc --noEmit
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'AIES non-recursive runtime smoke' -Action {
    Write-Host 'Smoke note: this quick path stays inside the current process tree. It validates audit evidence scanning, snapshot assessment, and the judgment-gate prompt bridge without spawning a child Pi session.' -ForegroundColor DarkYellow
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npx tsx ../aies/extensions/verification/quick-smoke.ts
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'Evolution evidence smoke' -Action {
    Write-Host 'Smoke note: this path validates the repo-native evidence index against the current durable corpus and checks that unsupported queries stay empty instead of fabricating certainty.' -ForegroundColor DarkYellow
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npx tsx ../aies/extensions/verification/evolution-evidence-smoke.ts
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'Theory-question lab smoke' -Action {
    Write-Host 'Smoke note: this path rebuilds the theory-question lab from the theory fork, confirms the result stays advisory-only, and proves ambiguous questions remain visibly unresolved instead of being over-specified.' -ForegroundColor DarkYellow
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npx tsx ../aies/extensions/verification/theory-question-lab-smoke.ts
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'Audit-guidance adaptation smoke' -Action {
    Write-Host 'Smoke note: this path checks that guidance adaptation stays advisory, that its corpus counters match durable guidance histories, and that thin history remains explicitly insufficient instead of fabricating trust.' -ForegroundColor DarkYellow
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npx tsx ../aies/extensions/verification/audit-guidance-adaptation-smoke.ts
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'Coherence-signal smoke' -Action {
    Write-Host 'Smoke note: this path rebuilds the first coherence map from durable repo artifacts, confirms that local and ambiguous signals are both possible, and proves thin theory/runtime evidence stays explicitly insufficient.' -ForegroundColor DarkYellow
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        Invoke-NativeCommand npx tsx ../aies/extensions/verification/coherence-signals-smoke.ts
    }
    finally {
        Pop-Location
    }
}

Write-Host 'AIES quick verification passed.' -ForegroundColor Green
