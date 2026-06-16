$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
$dataDir = Join-Path $root "data"
$lockPath = Join-Path $dataDir "data-update.lock"
$stamp = Get-Date -Format "yyyyMMdd"
$logPath = Join-Path $logDir "data-update-$stamp.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logPath -Value $line
  Write-Host $line
}

if (Test-Path $lockPath) {
  $lockAge = (Get-Date) - (Get-Item $lockPath).LastWriteTime
  if ($lockAge.TotalMinutes -lt 45) {
    Write-Log "Another update appears to be running. Lock age: $([math]::Round($lockAge.TotalMinutes, 1)) minutes."
    exit 0
  }

  Write-Log "Removing stale update lock. Lock age: $([math]::Round($lockAge.TotalMinutes, 1)) minutes."
  Remove-Item -LiteralPath $lockPath -Force
}

try {
  Set-Content -Path $lockPath -Value "$PID $(Get-Date -Format o)"
  Set-Location $root

  Write-Log "Starting scheduled data update."
  Write-Log "Working directory: $root"

  $nodeVersion = (& node --version) 2>&1
  Write-Log "Node: $nodeVersion"

  $env:NODE_OPTIONS = "--no-warnings"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & node server/update-data.js 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference

  foreach ($line in $output) {
    Add-Content -Path $logPath -Value ($line.ToString())
  }

  if ($exitCode -eq 0) {
    Write-Log "Data update completed successfully."

    Write-Log "Exporting dashboard snapshot."
    $exportOutput = & node scripts/export-dashboard-json.js 2>&1
    foreach ($line in $exportOutput) {
      Add-Content -Path $logPath -Value ($line.ToString())
    }
    $exportExitCode = $LASTEXITCODE
    if ($exportExitCode -ne 0) {
      Write-Log "Dashboard export failed with exit code $exportExitCode."
      exit $exportExitCode
    }

    Write-Log "Publishing dashboard snapshot to Vercel Blob."
    $publishOutput = & node scripts/publish-dashboard-blob.js 2>&1
    foreach ($line in $publishOutput) {
      Add-Content -Path $logPath -Value ($line.ToString())
    }
    $publishExitCode = $LASTEXITCODE
    if ($publishExitCode -ne 0) {
      Write-Log "Dashboard Blob publish failed with exit code $publishExitCode. Check .env.local, Vercel login, or Blob store link."
      exit $publishExitCode
    }
    Write-Log "Dashboard Blob publish completed successfully."
  } else {
    Write-Log "Data update failed with exit code $exitCode. Check .env.local and provider errors above."
  }

  exit $exitCode
} catch {
  Write-Log "Data update crashed: $($_.Exception.Message)"
  exit 1
} finally {
  if (Test-Path $lockPath) {
    Remove-Item -LiteralPath $lockPath -Force
  }
}
