param(
  [ValidateSet("dev", "frontend", "backend", "build", "install")]
  [string]$Mode = "dev"
)

$operatorUiRoot = Join-Path $PSScriptRoot "operator-ui"

if (-not (Test-Path $operatorUiRoot)) {
  throw "operator-ui directory not found at $operatorUiRoot"
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
      npm run backend
      if ($LASTEXITCODE -ne 0) {
        throw "npm run backend failed"
      }
    }
    "dev" {
      $backendWindow = Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$operatorUiRoot'; npm run backend"
      ) -PassThru

      Write-Host "Started backend in PowerShell process $($backendWindow.Id)."
      Write-Host "Launching frontend dev server in current shell..."
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
