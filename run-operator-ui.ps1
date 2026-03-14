param(
  [ValidateSet("dev", "frontend", "backend", "build", "install")]
  [string]$Mode = "dev"
)

$operatorUiRoot = Join-Path $PSScriptRoot "operator-ui"
$projectRoot = $PSScriptRoot
$piMonoRoot = if ($env:AIES_PI_MONO_ROOT) { $env:AIES_PI_MONO_ROOT } else { Join-Path $projectRoot "pi-mono" }

if (-not (Test-Path $operatorUiRoot)) {
  throw "operator-ui directory not found at $operatorUiRoot"
}

if (-not (Test-Path $piMonoRoot)) {
  throw "Pi-Mono root not found at $piMonoRoot. Set AIES_PI_MONO_ROOT or place pi-mono in the run root."
}

Push-Location $operatorUiRoot
try {
  if (-not (Test-Path (Join-Path $operatorUiRoot "node_modules"))) {
    Write-Host "Installing operator-ui dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed"
    }
  }

  switch ($Mode) {
    "install" {
      Write-Host "operator-ui dependencies are installed."
    }
    "build" {
      npm run build
      if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed"
      }
    }
    "frontend" {
      npm run dev
      if ($LASTEXITCODE -ne 0) {
        throw "npm run dev failed"
      }
    }
    "backend" {
      $env:AIES_PI_MONO_ROOT = $piMonoRoot
      npm run backend
      if ($LASTEXITCODE -ne 0) {
        throw "npm run backend failed"
      }
    }
    "dev" {
      $backendWindow = Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$env:AIES_PI_MONO_ROOT='$piMonoRoot'; Set-Location '$operatorUiRoot'; npm run backend"
      ) -PassThru

      Write-Host "Started backend in PowerShell process $($backendWindow.Id)."
      Write-Host "Launching frontend dev server in current shell..."
      $env:AIES_PI_MONO_ROOT = $piMonoRoot
      npm run dev
      if ($LASTEXITCODE -ne 0) {
        throw "npm run dev failed"
      }
    }
  }
}
finally {
  Pop-Location
}
