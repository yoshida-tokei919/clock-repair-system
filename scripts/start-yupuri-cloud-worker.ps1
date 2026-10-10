param(
    [switch]$Once,
    [switch]$AllowIssue,
    [int]$PollSeconds = 30
)
$ErrorActionPreference = 'Stop'
if ($PollSeconds -lt 5 -or $PollSeconds -gt 3600) { throw 'PollSeconds must be 5..3600' }
$repo = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $PSScriptRoot 'yupuri-cloud-worker.ts'
$tsx = Join-Path $repo 'node_modules\.bin\tsx.cmd'
if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) { throw 'Run npm ci before starting the worker' }
$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) { throw 'User N8N_INTERNAL_TOKEN is unavailable' }
$env:N8N_INTERNAL_TOKEN = $token
foreach ($name in @('YUPURI_APP_ORIGIN', 'YUPURI_CLOUD_INVOICES_URL', 'YUPURI_CLOUD_FILTER_NAME', 'YUPURI_CLOUD_PRINTER_NAME', 'YUPURI_CLOUD_CDP_URL')) {
    $value = [Environment]::GetEnvironmentVariable($name, 'User')
    if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
}
$workerArgs = @($worker, '--poll-seconds', "$PollSeconds")
if ($Once) { $workerArgs += '--once' }
if ($AllowIssue) { $workerArgs += '--allow-issue' }
Push-Location $repo
try { & $tsx @workerArgs; exit $LASTEXITCODE }
finally { Pop-Location }
