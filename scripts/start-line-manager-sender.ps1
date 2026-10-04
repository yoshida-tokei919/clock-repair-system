param(
    [switch]$AllowSend,
    [int]$PollSeconds = 30
)
$ErrorActionPreference = 'Stop'
if ($PollSeconds -lt 5) { throw 'PollSeconds must be at least 5' }

$repo = 'C:\Users\yoshi\clock-repair-system'
$worker = Join-Path $repo 'scripts\line_manager_sender_worker.py'
if (-not (Test-Path -LiteralPath $worker -PathType Leaf)) { throw 'Canonical sender worker is unavailable' }
$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) { throw 'User N8N_INTERNAL_TOKEN is unavailable' }
$env:N8N_INTERNAL_TOKEN = $token
$env:PYTHONUNBUFFERED = '1'

$logDir = Join-Path $env:USERPROFILE 'line-manager-sender-service\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fffffff'
$stdout = Join-Path $logDir "$stamp.stdout.log"
$stderr = Join-Path $logDir "$stamp.stderr.log"

$python = Get-Command py.exe -ErrorAction SilentlyContinue
if (-not $python) { throw 'Python launcher is unavailable' }
$workerArgs = @('-3', $worker, '--poll-seconds', "$PollSeconds")
if ($AllowSend) { $workerArgs += '--allow-send' }
& $python.Source @workerArgs 1>> $stdout 2>> $stderr
exit $LASTEXITCODE
