$ErrorActionPreference = 'Stop'
$url = [Environment]::GetEnvironmentVariable('YUPURI_CLOUD_INVOICES_URL', 'User')
if ([string]::IsNullOrWhiteSpace($url)) { $url = 'https://btoolboxprintservice.jp/invoices/' }
$parsed = [uri]$url
if ($parsed.Scheme -ne 'https' -or $parsed.Host -ne 'btoolboxprintservice.jp' -or
    $parsed.AbsolutePath -notin @('/invoices', '/invoices/') -or
    $parsed.Query -or $parsed.Fragment -or $parsed.UserInfo -or -not $parsed.IsDefaultPort) {
    throw 'Invalid production Cloud invoices URL'
}
$edge = Get-Command msedge.exe -ErrorAction SilentlyContinue
$edgePath = if ($edge) { $edge.Source } else { Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe' }
if (-not (Test-Path -LiteralPath $edgePath -PathType Leaf)) { throw 'Microsoft Edge is unavailable' }
$profile = Join-Path $env:LOCALAPPDATA 'clock-repair-system\yupuri-cloud-browser'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
# Visible interactive Edge is required for the user's login/MFA. Close it before starting the worker.
Start-Process -FilePath $edgePath -ArgumentList @("--user-data-dir=`"$profile`"", $url) -WindowStyle Normal
