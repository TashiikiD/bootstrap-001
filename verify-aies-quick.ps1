$ErrorActionPreference = 'Stop'

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

if (-not $env:AIES_PI_MONO_ROOT -and (Test-Path $defaultPiMonoRoot)) {
    $env:AIES_PI_MONO_ROOT = $defaultPiMonoRoot
    Write-Host "Using fallback AIES_PI_MONO_ROOT: $defaultPiMonoRoot" -ForegroundColor DarkGray
}

Invoke-Step -Label 'operator-ui build' -Action {
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        npm run build
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'operator-ui typecheck' -Action {
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        npx tsc --noEmit
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Label 'AIES non-recursive runtime smoke' -Action {
    Write-Host 'Smoke note: this quick path stays inside the current process tree. It validates audit evidence scanning, snapshot assessment, and the judgment-gate prompt bridge without spawning a child Pi session.' -ForegroundColor DarkYellow
    Push-Location (Join-Path $projectRoot 'operator-ui')
    try {
        npx tsx ../aies/extensions/verification/quick-smoke.ts
    }
    finally {
        Pop-Location
    }
}

Write-Host 'AIES quick verification passed.' -ForegroundColor Green
