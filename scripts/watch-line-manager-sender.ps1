$ErrorActionPreference = 'Stop'

$taskName = 'ClockRepair-LineManagerSender'
$cooldown = [TimeSpan]::FromMinutes(15)
$alertInterval = [TimeSpan]::FromHours(6)
$statePath = $null
$mutex = $null
$acquired = $false

function Read-WatchdogState {
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        return @{ lastStartUtc = $null; lastAlertUtc = $null }
    }
    $raw = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $raw -or @($raw.PSObject.Properties.Name | Sort-Object) -join ',' -ne 'lastAlertUtc,lastStartUtc') {
        throw 'invalid watchdog state'
    }
    $state = @{ lastStartUtc = $null; lastAlertUtc = $null }
    foreach ($key in @('lastStartUtc', 'lastAlertUtc')) {
        if ($null -eq $raw.$key) { continue }
        if ($raw.$key -isnot [string]) { throw 'invalid watchdog timestamp' }
        $parsed = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParseExact($raw.$key, 'o', [cultureinfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) {
            throw 'invalid watchdog timestamp'
        }
        $state[$key] = $parsed.ToUniversalTime()
    }
    return $state
}

function Save-WatchdogState($state) {
    $directory = Split-Path -Parent $statePath
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = "$statePath.$PID.tmp"
    try {
        @{ lastStartUtc = $(if ($state.lastStartUtc) { $state.lastStartUtc.ToString('o') } else { $null });
           lastAlertUtc = $(if ($state.lastAlertUtc) { $state.lastAlertUtc.ToString('o') } else { $null }) } |
            ConvertTo-Json -Compress | Set-Content -LiteralPath $temporary -Encoding UTF8
        Move-Item -LiteralPath $temporary -Destination $statePath -Force
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

function Emit-WatchdogStatus([string]$status, [bool]$alertDue) {
    Write-Output "status=$status;alertDue=$($alertDue.ToString().ToLowerInvariant())"
}

try {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw 'local state unavailable' }
    $statePath = Join-Path $env:LOCALAPPDATA 'clock-repair-system\line-manager-sender\watchdog-state.json'
    $mutex = [System.Threading.Mutex]::new($false, 'Local\ClockRepairLineManagerSenderWatchdog')
    $acquired = $mutex.WaitOne(0)
    if (-not $acquired) {
        Emit-WatchdogStatus 'busy' $false
        exit 0
    }
    $now = [DateTimeOffset]::UtcNow
    $state = Read-WatchdogState
    foreach ($key in @('lastStartUtc', 'lastAlertUtc')) {
        if ($state[$key] -and $state[$key] -gt $now.AddMinutes(1)) { throw 'future watchdog timestamp' }
    }
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ($task.Settings.Enabled -ne $true) { throw 'sender task disabled' }
    if ($task.State -eq 'Running') {
        $state.lastAlertUtc = $null
        Save-WatchdogState $state
        Emit-WatchdogStatus 'running' $false
        exit 0
    }
    if ($task.State -ne 'Ready') { throw 'sender task not ready' }
    if ($state.lastStartUtc -and ($now - $state.lastStartUtc) -lt $cooldown) {
        $status = 'cooldown'
    } else {
        # Persist before requesting a start, so a failure cannot cause a restart storm.
        $state.lastStartUtc = $now
        Save-WatchdogState $state
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
        $status = 'start_requested'
    }
    if ($status -eq 'cooldown') {
        $alertDue = -not $state.lastAlertUtc -or ($now - $state.lastAlertUtc) -ge $alertInterval
        if ($alertDue) {
            $state.lastAlertUtc = $now
            Save-WatchdogState $state
        }
        Emit-WatchdogStatus $status $alertDue
    } else {
        Emit-WatchdogStatus $status $false
    }
    exit 0
} catch {
    $alertDue = $true
    if ($acquired -and $state) {
        try {
            $now = [DateTimeOffset]::UtcNow
            $alertDue = -not $state.lastAlertUtc -or ($now - $state.lastAlertUtc) -ge $alertInterval
            if ($alertDue) {
                $state.lastAlertUtc = $now
                Save-WatchdogState $state
            }
        } catch { $alertDue = $true }
    }
    Emit-WatchdogStatus 'watchdog_unavailable' $alertDue
    exit 1
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
