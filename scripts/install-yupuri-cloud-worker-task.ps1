param([switch]$Enable, [switch]$AllowIssue)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'start-yupuri-cloud-worker.ps1'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Worker launcher is unavailable' }
if (-not $Enable) {
    Write-Output 'status=preview; registration requires -Enable; issuance requires -AllowIssue'
    return
}
$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) { throw 'User N8N_INTERNAL_TOKEN is unavailable' }
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escaped = $launcher.Replace('"', '""')
$argument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escaped`""
if ($AllowIssue) { $argument += ' -AllowIssue' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3 -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName 'ClockRepair-YuPriCloudWorker' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Enable-ScheduledTask -TaskName 'ClockRepair-YuPriCloudWorker' | Out-Null
Write-Output "status=enabled; allowIssue=$([bool]$AllowIssue)"
