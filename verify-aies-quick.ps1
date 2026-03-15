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

Invoke-Step -Label 'AIES runtime slash-command smoke' -Action {
    Write-Host 'Smoke note: this runs /cycle-status in a fresh local Pi session. The live-status lines below describe that smoke session, so any operator-control session mismatch there is advisory context, not a rewrite of the current working session.' -ForegroundColor DarkYellow
    Push-Location $projectRoot
    try {
        .\run-aies-on-pi.ps1 -PiArgs @('--offline', '-p', '/cycle-status')
    }
    finally {
        Pop-Location
    }
}

Write-Host 'AIES quick verification passed.' -ForegroundColor Green
