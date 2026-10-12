$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $repo 'node_modules\.bin\tsx.cmd'
if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) { throw 'Run npm ci before starting the print helper' }
$origin = [Environment]::GetEnvironmentVariable('DELIVERY_PRINT_ALLOWED_ORIGIN', 'User')
if ([string]::IsNullOrWhiteSpace($origin)) { throw 'Set user environment variable DELIVERY_PRINT_ALLOWED_ORIGIN to the application origin' }
$env:DELIVERY_PRINT_ALLOWED_ORIGIN = $origin
Push-Location $repo
try { & $tsx (Join-Path $PSScriptRoot 'delivery-note-print-helper.ts'); exit $LASTEXITCODE }
finally { Pop-Location }
