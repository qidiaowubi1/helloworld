$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
$tasks = @("SpaceXMonitor-Periodic", "SpaceXMonitor-PostMarket")

foreach ($task in $tasks) {
  Write-Host ""
  Write-Host "== $task =="
  schtasks.exe /Query /TN $task /FO LIST /V
}

Write-Host ""
Write-Host "== Recent update logs =="
if (Test-Path $logDir) {
  Get-ChildItem -Path $logDir -Filter "data-update-*.log" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 5 FullName, LastWriteTime, Length |
    Format-Table -AutoSize
} else {
  Write-Host "No logs directory yet."
}
