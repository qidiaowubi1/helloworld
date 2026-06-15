param(
  [int]$IntervalMinutes = 120
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$shimDir = "C:\tmp"
$shim = Join-Path $shimDir "spacex-monitor-update.cmd"

New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
Set-Content -Path $shim -Encoding ASCII -Value @(
  "@echo off",
  "cd /d `"$root`"",
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%CD%\scripts\run-data-update.ps1`""
)

$taskCommand = $shim

if ($IntervalMinutes -lt 30) {
  throw "IntervalMinutes must be 30 or greater to avoid provider rate-limit issues."
}

$schedule = if ($IntervalMinutes -lt 60) { "MINUTE" } else { "HOURLY" }
$modifier = if ($IntervalMinutes -lt 60) { $IntervalMinutes } else { [math]::Max(1, [math]::Round($IntervalMinutes / 60)) }

$periodicResult = & schtasks.exe /Create /TN "SpaceXMonitor-Periodic" /SC $schedule /MO $modifier /TR $taskCommand /F 2>&1
$periodicExitCode = $LASTEXITCODE
$periodicResult | Out-Host
if ($periodicExitCode -ne 0) {
  throw "Failed to install SpaceXMonitor-Periodic."
}

$postMarketResult = & schtasks.exe /Create /TN "SpaceXMonitor-PostMarket" /SC DAILY /ST "18:30" /TR $taskCommand /F 2>&1
$postMarketExitCode = $LASTEXITCODE
$postMarketResult | Out-Host
if ($postMarketExitCode -ne 0) {
  throw "Failed to install SpaceXMonitor-PostMarket."
}

Write-Host "Installed SpaceXMonitor-Periodic: every $IntervalMinutes minutes."
Write-Host "Installed SpaceXMonitor-PostMarket: daily at 18:30 local time."
Write-Host "Logs: $(Join-Path $root "logs\data-update-YYYYMMDD.log")"
