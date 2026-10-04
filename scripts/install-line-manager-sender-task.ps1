param([switch]$Enable)
$ErrorActionPreference = 'Stop'

$taskName = 'ClockRepair-LineManagerSender'
$repo = 'C:\Users\yoshi\clock-repair-system'
$launcher = Join-Path $repo 'scripts\start-line-manager-sender.ps1'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Canonical sender launcher is unavailable' }

if (-not $Enable) {
    Write-Output 'status=preview; task registration requires -Enable'
    return
}

$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) { throw 'User N8N_INTERNAL_TOKEN is unavailable' }
$storage = Join-Path $env:LOCALAPPDATA 'clock-repair-system\linelib-poc\lineoa-storage.json'
if (-not (Test-Path -LiteralPath $storage -PathType Leaf)) { throw 'LINE Manager auth storage is unavailable' }

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedLauncher = $launcher.Replace('"', '""')
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escapedLauncher`" -AllowSend" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 10 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Enable-ScheduledTask -TaskName $taskName | Out-Null
Write-Output 'status=enabled'
