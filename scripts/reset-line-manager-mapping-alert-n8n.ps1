$ErrorActionPreference = 'Stop'

$mutexName = 'Global\ClockRepairSystem_LineManagerMappingN8n_206C2B'
$lockWaitMilliseconds = 300000
$statePath = Join-Path $env:LOCALAPPDATA 'clock-repair-system\line-manager-mapping-n8n\alert-state.json'
$status = 'alert_state_reset_failed'
$mutex = $null
$hasLock = $false

try {
    if ($args.Count -ne 0) { throw 'Arguments are not accepted' }
    $mutex = New-Object System.Threading.Mutex($false, $mutexName)
    try { $hasLock = $mutex.WaitOne($lockWaitMilliseconds) }
    catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
    if ($hasLock) {
        if (Test-Path -LiteralPath $statePath) {
            Remove-Item -LiteralPath $statePath -Force -ErrorAction Stop
        }
        $status = 'alert_state_reset'
    }
} catch {
    $status = 'alert_state_reset_failed'
} finally {
    if ($hasLock) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}

Write-Output "status=$status"
exit 0
