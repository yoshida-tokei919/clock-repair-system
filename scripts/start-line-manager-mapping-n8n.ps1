$ErrorActionPreference = 'Stop'

$mutexName = 'Global\ClockRepairSystem_LineManagerMappingN8n_206C2B'
$lockWaitMilliseconds = 300000
$childTimeoutMilliseconds = 240000
$pollMilliseconds = 200
$maxStdoutBytes = 4096
$maxStderrBytes = 65536
$alertInterval = [TimeSpan]::FromHours(6)
$unhealthyStatuses = @('pending_no_exact_match', 'pending_ambiguity', 'mapping_conflict', 'manager_live_read_unavailable', 'internal_api_unavailable', 'configuration_failure', 'lineoa_operation_busy')

function New-ConfigurationFailure {
    return [ordered]@{ status = 'configuration_failure'; candidateCount = 0; scannedChatCount = 0; safeMatchCount = 0; runnerExitCode = -1; healthy = $false; alertDue = $true }
}

function Initialize-MappingJob {
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class MappingJob {
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
    const int JobObjectExtendedLimitInformation = 9;
    const int JobObjectBasicAccountingInformation = 1;

    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimit {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimit {
        public BasicLimit BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct BasicAccounting {
        public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimit info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out BasicAccounting info, uint length, IntPtr returnLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);

    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    public static IntPtr Create() {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        return job;
    }
    public static void Configure(IntPtr job) {
        ExtendedLimit info = new ExtendedLimit();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        Check(SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref info, (uint)Marshal.SizeOf(typeof(ExtendedLimit))));
    }
    public static void Assign(IntPtr job, IntPtr process) { Check(AssignProcessToJobObject(job, process)); }
    public static uint Active(IntPtr job) {
        BasicAccounting info;
        Check(QueryInformationJobObject(job, JobObjectBasicAccountingInformation, out info,
            (uint)Marshal.SizeOf(typeof(BasicAccounting)), IntPtr.Zero));
        return info.ActiveProcesses;
    }
    public static void Terminate(IntPtr job) { Check(TerminateJobObject(job, 1)); }
    public static void Close(IntPtr job) { Check(CloseHandle(job)); }
}
'@
}

function Read-RunnerResult {
    Initialize-MappingJob
    $repo = 'C:\Users\yoshi\clock-repair-system'
    $runner = Join-Path $repo 'scripts\start-line-manager-mapping.ps1'
    if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'Runner unavailable' }
    $powerShell = Get-Command powershell.exe -ErrorAction Stop
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $powerShell.Source
    # The fixed child command cannot invoke C2A until the parent assigns its Job.
    $gateCommand = '$gate = [Console]::In.ReadLine(); if ($gate -cne ''RUN'') { exit 1 }; & ''' + $runner + ''' -Apply; exit $LASTEXITCODE'
    $startInfo.Arguments = '-NoProfile -NonInteractive -Command "' + $gateCommand + '"'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.RedirectStandardInput = $true
    $stdoutPath = Join-Path ([IO.Path]::GetTempPath()) ('mapping-n8n-' + [guid]::NewGuid().ToString('N') + '.out')
    $stderrPath = Join-Path ([IO.Path]::GetTempPath()) ('mapping-n8n-' + [guid]::NewGuid().ToString('N') + '.err')
    $process = New-Object System.Diagnostics.Process
    $stdoutFile = $null
    $stderrFile = $null
    $started = $false
    $assigned = $false
    $mustTerminateJob = $false
    $job = [IntPtr]::Zero
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $stdoutCopy = $null
    $stderrCopy = $null
    try {
        $stdoutFile = New-Object IO.FileStream($stdoutPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $stderrFile = New-Object IO.FileStream($stderrPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $process.StartInfo = $startInfo
        if (-not $process.Start()) { throw 'Runner did not start' }
        $started = $true
        # Both pipes are drained concurrently to files; no child text is echoed.
        $stdoutCopy = $process.StandardOutput.BaseStream.CopyToAsync($stdoutFile)
        $stderrCopy = $process.StandardError.BaseStream.CopyToAsync($stderrFile)
        $job = [MappingJob]::Create()
        [MappingJob]::Configure($job)
        [MappingJob]::Assign($job, $process.Handle)
        $assigned = $true
        if ($clock.ElapsedMilliseconds -ge $childTimeoutMilliseconds) { $mustTerminateJob = $true; throw 'Runner timed out before gate' }
        $process.StandardInput.WriteLine('RUN')
        $process.StandardInput.Close()
        while ($true) {
            if ($stdoutFile.Length -gt $maxStdoutBytes -or $stderrFile.Length -gt $maxStderrBytes) {
                $mustTerminateJob = $true
                throw 'Runner output too large'
            }
            $waitMilliseconds = [Math]::Max(0, [Math]::Min($pollMilliseconds, $childTimeoutMilliseconds - $clock.ElapsedMilliseconds))
            if ($process.WaitForExit($waitMilliseconds)) { break }
            if ($clock.ElapsedMilliseconds -ge $childTimeoutMilliseconds) {
                $mustTerminateJob = $true
                throw 'Runner timed out'
            }
        }
        # A root may exit while a grandchild still owns the redirected pipes.
        if ([MappingJob]::Active($job) -ne 0) { $mustTerminateJob = $true; throw 'Runner job still active after root exit' }
        if ($clock.ElapsedMilliseconds -ge $childTimeoutMilliseconds) { $mustTerminateJob = $true; throw 'Runner timed out' }
        $drainWaitMilliseconds = [Math]::Max(0, $childTimeoutMilliseconds - $clock.ElapsedMilliseconds)
        if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdoutCopy, $stderrCopy), $drainWaitMilliseconds)) {
            $mustTerminateJob = $true
            throw 'Runner pipe drain timed out'
        }
        $stdoutFile.Flush()
        $stderrFile.Flush()
        if ($stdoutFile.Length -gt $maxStdoutBytes -or $stderrFile.Length -gt $maxStderrBytes) { $mustTerminateJob = $true; throw 'Runner output too large' }
        $runnerExitCode = $process.ExitCode
        $stdoutFile.Dispose()
        $stdoutFile = $null
        $output = [IO.File]::ReadAllText($stdoutPath, [Text.Encoding]::UTF8)
    } finally {
        if ($started -and -not $assigned) {
            # The gate was never released; taskkill is safe for this root only.
            try { & taskkill.exe /PID $process.Id /T /F 1>$null 2>$null } catch { }
            try { $null = $process.WaitForExit(2000) } catch { }
        }
        if ($job -ne [IntPtr]::Zero) {
            # This also kills any remaining Job process if explicit termination fails.
            try {
                if ($assigned -and ($mustTerminateJob -or [MappingJob]::Active($job) -ne 0)) { [MappingJob]::Terminate($job) }
            } catch { try { [MappingJob]::Terminate($job) } catch { } }
            try { [MappingJob]::Close($job) } finally { $job = [IntPtr]::Zero }
            if ($started -and $assigned) { try { $null = $process.WaitForExit(2000) } catch { } }
        }
        if ($started) {
            try { $process.StandardInput.Dispose() } catch { }
            try { $process.StandardOutput.BaseStream.Dispose() } catch { }
            try { $process.StandardError.BaseStream.Dispose() } catch { }
        }
        if ($stdoutFile) { $stdoutFile.Dispose() }
        if ($stderrFile) { $stderrFile.Dispose() }
        $process.Dispose()
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }

    $output = $output -creplace '\r?\n\z', ''
    $pattern = '^status=(healthy_no_candidates|verified|pending_no_exact_match|pending_ambiguity|mapping_conflict|manager_live_read_unavailable|internal_api_unavailable|configuration_failure|lineoa_operation_busy) candidate_count=([0-9]+) scanned_chat_count=([0-9]+) safe_match_count=([0-9]+)$'
    if ($output -cnotmatch $pattern) { throw 'Runner result invalid' }
    $status = $Matches[1]
    $expectedExit = if ($status -in @('healthy_no_candidates', 'verified', 'pending_no_exact_match', 'pending_ambiguity')) { 0 } else { 1 }
    if ($runnerExitCode -ne $expectedExit) { throw 'Runner exit mismatch' }
    return [ordered]@{
        status = $status
        candidateCount = [int]::Parse($Matches[2])
        scannedChatCount = [int]::Parse($Matches[3])
        safeMatchCount = [int]::Parse($Matches[4])
        runnerExitCode = [int]$runnerExitCode
        healthy = $status -in @('healthy_no_candidates', 'verified')
        alertDue = $false
    }
}

function Set-AlertDue($result) {
    $stateDir = Join-Path $env:LOCALAPPDATA 'clock-repair-system\line-manager-mapping-n8n'
    $statePath = Join-Path $stateDir 'alert-state.json'
    if ($result.healthy) {
        if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath -Force -ErrorAction Stop }
        return
    }
    $now = [DateTimeOffset]::UtcNow
    $alertDue = $true
    if (Test-Path -LiteralPath $statePath) {
        $state = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8) | ConvertFrom-Json -ErrorAction Stop
        $keys = @($state.PSObject.Properties.Name)
        if ($keys.Count -ne 2 -or $keys -notcontains 'lastUnhealthyStatus' -or $keys -notcontains 'lastAlertAt' -or
            $state.lastUnhealthyStatus -cnotin $unhealthyStatuses -or $state.lastAlertAt -isnot [string]) { throw 'Invalid alert state' }
        $lastAlert = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParseExact($state.lastAlertAt, 'O', [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::RoundtripKind, [ref]$lastAlert) -or $lastAlert -gt $now) { throw 'Invalid alert time' }
        if ($state.lastUnhealthyStatus -ceq $result.status -and $now - $lastAlert -lt $alertInterval) { $alertDue = $false }
    }
    if ($alertDue) {
        [IO.Directory]::CreateDirectory($stateDir) | Out-Null
        $temporaryPath = Join-Path $stateDir ('alert-state-' + [guid]::NewGuid().ToString('N') + '.tmp')
        $backupPath = Join-Path $stateDir ('alert-state-' + [guid]::NewGuid().ToString('N') + '.bak')
        try {
            $stateJson = ConvertTo-Json -Compress -InputObject ([ordered]@{
                lastUnhealthyStatus = $result.status
                lastAlertAt = $now.ToString('O', [Globalization.CultureInfo]::InvariantCulture)
            })
            [IO.File]::WriteAllText($temporaryPath, $stateJson, [Text.Encoding]::UTF8)
            if (Test-Path -LiteralPath $statePath) {
                try {
                    [IO.File]::Replace($temporaryPath, $statePath, $backupPath)
                } catch {
                    # Some constrained local filesystems deny Replace; retain the
                    # mutex and fail closed if even the local move is denied.
                    Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force -ErrorAction Stop
                }
            } else {
                [IO.File]::Move($temporaryPath, $statePath)
            }
        } finally {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        }
    }
    $result.alertDue = $alertDue
}

$result = New-ConfigurationFailure
$mutex = $null
$hasLock = $false
try {
    $mutex = New-Object System.Threading.Mutex($false, $mutexName)
    try { $hasLock = $mutex.WaitOne($lockWaitMilliseconds) }
    catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
    if ($hasLock) {
        try { $result = Read-RunnerResult }
        catch { $result = New-ConfigurationFailure }
        try { Set-AlertDue $result }
        catch { $result = New-ConfigurationFailure }
    }
} catch {
    $result = New-ConfigurationFailure
} finally {
    if ($hasLock) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
Write-Output (ConvertTo-Json -InputObject $result -Compress)
exit 0
