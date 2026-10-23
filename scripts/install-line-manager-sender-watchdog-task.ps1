param([switch]$Enable)
$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\yoshi\clock-repair-system'
$watchdog = Join-Path $repo 'scripts\watch-line-manager-sender.ps1'
if (-not (Test-Path -LiteralPath $watchdog -PathType Leaf)) { throw 'Canonical watchdog is unavailable' }
if (-not $Enable) {
    Write-Output 'status=preview; watchdog task registration requires -Enable'
    return
}

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedWatchdog = $watchdog.Replace('"', '""')
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escapedWatchdog`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'ClockRepair-LineManagerSenderWatchdog' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Enable-ScheduledTask -TaskName 'ClockRepair-LineManagerSenderWatchdog' | Out-Null
Write-Output 'status=enabled'
