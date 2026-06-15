$ErrorActionPreference = "SilentlyContinue"
schtasks.exe /Delete /TN "SpaceXMonitor-Periodic" /F | Out-Null
schtasks.exe /Delete /TN "SpaceXMonitor-PostMarket" /F | Out-Null
Unregister-ScheduledTask -TaskName "SpaceXMonitor-PreMarket" -Confirm:$false
Unregister-ScheduledTask -TaskName "SpaceXMonitor-PostMarket" -Confirm:$false
Remove-Item -LiteralPath "C:\tmp\spacex-monitor-update.cmd" -Force
Write-Host "Removed SpaceX monitor scheduled tasks if they existed."
