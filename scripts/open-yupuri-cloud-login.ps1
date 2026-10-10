$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $repo 'node_modules\.bin\tsx.cmd'
$helper = Join-Path $PSScriptRoot 'await-yupuri-cloud-login.ts'
if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) { throw 'Run npm ci before opening Cloud login' }
$endpoint = [Environment]::GetEnvironmentVariable('YUPURI_CLOUD_CDP_URL', 'User')
if ([string]::IsNullOrWhiteSpace($endpoint)) { $endpoint = 'http://127.0.0.1:18822' }
if ($endpoint -cnotmatch '^http://127\.0\.0\.1:([1-9][0-9]{3,4})$') { throw 'Cloud CDP endpoint must be a dedicated localhost port' }
$port = [int]$Matches[1]
if ($port -lt 1024 -or $port -gt 65535 -or $port -in @(18820, 18821)) { throw 'Cloud CDP endpoint must be a dedicated localhost port' }
$env:YUPURI_CLOUD_CDP_URL = $endpoint
$localAppData = [Environment]::GetFolderPath('LocalApplicationData')
if ([string]::IsNullOrWhiteSpace($localAppData)) { throw 'LOCALAPPDATA is required' }
$env:LOCALAPPDATA = $localAppData
$profile = Join-Path $localAppData 'clock-repair-system\yupuri-cloud\edge-profile'
$repoRoot = [System.IO.Path]::GetFullPath($repo).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if ([System.IO.Path]::GetFullPath($profile).StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Cloud Edge profile must be outside the repository'
}
$listener = $false
$client = New-Object System.Net.Sockets.TcpClient
try {
    $attempt = $client.ConnectAsync('127.0.0.1', $port)
    $listener = $attempt.Wait(500) -and $client.Connected
} catch { $listener = $false }
finally { $client.Dispose() }
if (-not $listener) {
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
        'https://btoolboxprintservice.jp/invoices/'
    )
    Start-Process -FilePath $edge -ArgumentList $arguments | Out-Null
}
$url = [Environment]::GetEnvironmentVariable('YUPURI_CLOUD_INVOICES_URL', 'User')
if (-not [string]::IsNullOrWhiteSpace($url)) { $env:YUPURI_CLOUD_INVOICES_URL = $url }
Push-Location $repo
try { & $tsx $helper; if ($LASTEXITCODE -ne 0) { throw 'Cloud login was not confirmed' } }
finally { Pop-Location }
