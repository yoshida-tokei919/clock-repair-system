$ErrorActionPreference = 'Stop'
function Assert-ToolboxAutomationWindowOpen([datetime]$UtcNow = [DateTime]::UtcNow) {
    $jst = [System.TimeZoneInfo]::ConvertTimeFromUtc($UtcNow, [System.TimeZoneInfo]::FindSystemTimeZoneById('Tokyo Standard Time'))
    if ($jst.Hour -lt 6 -or $jst.TimeOfDay -ge ([TimeSpan]::FromHours(23) + [TimeSpan]::FromMinutes(55))) {
        throw 'JP Business ToolBox automation window is 06:00-23:55 JST'
    }
}
$repo = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $repo 'node_modules\.bin\tsx.cmd'
$helper = Join-Path $PSScriptRoot 'await-yupuri-cloud-login.ts'
if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) { throw 'Run npm ci before opening Cloud login' }
$endpoint = [Environment]::GetEnvironmentVariable('YUPURI_CLOUD_CDP_URL', 'User')
if ([string]::IsNullOrWhiteSpace($endpoint)) { $endpoint = 'http://127.0.0.1:18822' }
if ($endpoint -cnotmatch '^http://127\.0\.0\.1:([1-9][0-9]{3,4})$') { throw 'Cloud CDP endpoint must be a dedicated localhost port' }
$port = [int]$Matches[1]
if ($port -lt 1024 -or $port -gt 65535 -or $port -in @(18820, 18821)) { throw 'Cloud CDP endpoint must be a dedicated localhost port' }
Assert-ToolboxAutomationWindowOpen
$env:YUPURI_CLOUD_CDP_URL = $endpoint
$localAppData = [Environment]::GetFolderPath('LocalApplicationData')
if ([string]::IsNullOrWhiteSpace($localAppData)) { throw 'LOCALAPPDATA is required' }
$env:LOCALAPPDATA = $localAppData
$profile = Join-Path $localAppData 'clock-repair-system\yupuri-cloud\edge-profile'
$repoRoot = [System.IO.Path]::GetFullPath($repo).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if ([System.IO.Path]::GetFullPath($profile).StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Cloud Edge profile must be outside the repository'
}
$localRoot = Split-Path -Parent $profile
$restartLock = Join-Path $localRoot 'edge-restart.lock'
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
New-Item -ItemType Directory -Path $restartLock -ErrorAction Stop | Out-Null
try {
    function Get-UserDataDirFlags([string]$CommandLine) {
        # Start-Process can quote either the value or the entire argument.
        $pattern = '(?i)(?<!\S)(?:"--user-data-dir=([^"\r\n]+)"|--user-data-dir="([^"\r\n]+)"|--user-data-dir=([^\s"]+))(?=\s|$)'
        foreach ($match in [regex]::Matches($CommandLine, $pattern)) {
            foreach ($group in $match.Groups[1..3]) {
                if ($group.Success) { $group.Value; break }
            }
        }
    }
    function Get-DedicatedProcesses([int]$TargetProcessId = 0) {
        $filter = if ($TargetProcessId -gt 0) { "Name = 'msedge.exe' AND ProcessId = $TargetProcessId" } else { "Name = 'msedge.exe'" }
        $all = @(Get-CimInstance Win32_Process -Filter $filter)
        foreach ($process in $all) {
            $profileFlags = @(Get-UserDataDirFlags $process.CommandLine)
            $usesProfile = $false
            foreach ($flag in $profileFlags) {
                try { $full = [System.IO.Path]::GetFullPath($flag) } catch { continue }
                if ([string]::Equals($full, [System.IO.Path]::GetFullPath($profile), [StringComparison]::OrdinalIgnoreCase)) {
                    $usesProfile = $true
                }
            }
            if (-not $usesProfile) { continue }
            $flagStarts = [regex]::Matches($process.CommandLine, '(?i)(?<!\S)"?--user-data-dir(?==|\s|"|$)')
            if ($profileFlags.Count -ne 1 -or $flagStarts.Count -ne 1) { throw 'Dedicated Edge profile flags are ambiguous; close it manually' }
            $process
        }
    }
    function Get-DedicatedRootProcess($ExactProfileProcesses) {
        if (@($ExactProfileProcesses).Count -eq 0) { return }
        $roots = @($ExactProfileProcesses | Where-Object {
            $_.CommandLine -notmatch '(?i)(?:^|\s)--type(?:=|\s|$)'
        })
        if ($roots.Count -ne 1) { throw 'Dedicated Edge must have exactly one valid browser root; close it manually' }
        $ports = [regex]::Matches($roots[0].CommandLine, '(?i)(?:^|\s)--remote-debugging-port=([^\s]+)')
        $addresses = [regex]::Matches($roots[0].CommandLine, '(?i)(?:^|\s)--remote-debugging-address=([^\s]+)')
        if ($ports.Count -ne 1 -or $ports[0].Groups[1].Value -cne "$port" -or
            $addresses.Count -ne 1 -or $addresses[0].Groups[1].Value -cne '127.0.0.1') {
            throw 'Dedicated Edge browser root CDP flags changed; close it manually'
        }
        return $roots[0]
    }
    $dedicated = @(Get-DedicatedProcesses)
    if ($dedicated.Count -gt 0) {
        $root = Get-DedicatedRootProcess $dedicated
        $rechecked = @(Get-DedicatedProcesses -TargetProcessId $root.ProcessId)
        if ($rechecked.Count -ne 1 -or
            (Get-DedicatedRootProcess $rechecked).ProcessId -ne $root.ProcessId) {
            throw 'Dedicated Edge root identity changed before close'
        }
        Stop-Process -Id $root.ProcessId -Force -ErrorAction Stop
    }
    for ($i = 0; $i -lt 40; $i++) {
        if (@(Get-DedicatedProcesses).Count -eq 0) { break }
        Start-Sleep -Milliseconds 250
    }
    if (@(Get-DedicatedProcesses).Count -ne 0) { throw 'Dedicated Edge processes remain; close them manually' }
    $listener = $false
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $attempt = $client.ConnectAsync('127.0.0.1', $port)
        $listener = $attempt.Wait(500) -and $client.Connected
    } catch { $listener = $false }
    finally { $client.Dispose() }
    if ($listener) { throw 'Dedicated CDP port is occupied; refusing to control another Edge process' }
    $edgeCommand = Get-Command msedge.exe -ErrorAction SilentlyContinue
    $edge = if ($edgeCommand) { $edgeCommand.Source } else { $null }
    if (-not $edge) {
        foreach ($base in @(
            [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFilesX86)
            [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
        )) {
            if ([string]::IsNullOrWhiteSpace($base)) { continue }
            $candidate = Join-Path $base 'Microsoft\Edge\Application\msedge.exe'
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $edge = $candidate; break }
        }
    }
    if (-not $edge) { throw 'Microsoft Edge is unavailable' }
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    $arguments = @(
        '--remote-debugging-address=127.0.0.1',
        "--remote-debugging-port=$port",
        "`"--user-data-dir=$profile`"",
        '--enable-automation',
        '--no-first-run',
        'https://www.post.japanpost.jp/bizpost/service/businesstoolbox/'
    )
    Assert-ToolboxAutomationWindowOpen
    Start-Process -FilePath $edge -ArgumentList $arguments | Out-Null
    $url = [Environment]::GetEnvironmentVariable('YUPURI_CLOUD_INVOICES_URL', 'User')
    if (-not [string]::IsNullOrWhiteSpace($url)) { $env:YUPURI_CLOUD_INVOICES_URL = $url }
    Push-Location $repo
    try { & $tsx $helper; if ($LASTEXITCODE -ne 0) { throw 'Cloud login was not confirmed' } }
    finally { Pop-Location }
} finally {
    Remove-Item -LiteralPath $restartLock -Force -ErrorAction SilentlyContinue
}
