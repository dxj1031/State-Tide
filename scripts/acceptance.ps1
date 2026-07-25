$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$acceptanceUrl = "http://127.0.0.1:3002"
$serverProcess = $null

Set-Location -LiteralPath $projectRoot

function Invoke-NpmStep {
  param(
    [Parameter(Mandatory)]
    [string] $Name,
    [Parameter(Mandatory)]
    [string[]] $Arguments
  )

  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

try {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js and try again."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Invoke-NpmStep -Name "Installing dependencies" -Arguments @("install")
  }

  Invoke-NpmStep -Name "Running tests" -Arguments @("test")
  Invoke-NpmStep -Name "Building production app" -Arguments @("run", "build")

  Write-Host "`n==> Starting acceptance server at $acceptanceUrl" -ForegroundColor Cyan
  $serverProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "start", "--", "--hostname", "127.0.0.1", "--port", "3002") `
    -WorkingDirectory $projectRoot `
    -NoNewWindow `
    -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($serverProcess.HasExited) {
      throw "The acceptance server exited before it became ready."
    }

    try {
      $response = Invoke-WebRequest -Uri $acceptanceUrl -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    }
    catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $ready) {
    throw "The acceptance server did not become ready within 30 seconds."
  }

  Write-Host "`nAcceptance passed. Opening $acceptanceUrl" -ForegroundColor Green
  Start-Process $acceptanceUrl
  Write-Host "Press Enter to stop the acceptance server and close this window."
  Read-Host | Out-Null
}
finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    & taskkill.exe /PID $serverProcess.Id /T /F 2>$null | Out-Null
  }
}
