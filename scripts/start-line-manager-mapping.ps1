param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$priorToken = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'Process')
$priorNoBytecode = [Environment]::GetEnvironmentVariable('PYTHONDONTWRITEBYTECODE', 'Process')

try {
    if (-not $Apply) { throw 'Explicit apply is required' }
    $repo = 'C:\Users\yoshi\clock-repair-system'
    $worker = Join-Path $repo 'scripts\line_manager_mapping.py'
    if (-not (Test-Path -LiteralPath $worker -PathType Leaf)) { throw 'Worker unavailable' }
    $token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Token unavailable' }
    $python = Get-Command py.exe -ErrorAction Stop
    $env:N8N_INTERNAL_TOKEN = $token
    $env:PYTHONDONTWRITEBYTECODE = '1'
    $output = @(& $python.Source -3 $worker --apply 2>$null)
    $exitCode = $LASTEXITCODE
    if ($output.Count -ne 1 -or $output[0] -cnotmatch '^status=(healthy_no_candidates|verified|pending_no_exact_match|pending_ambiguity|mapping_conflict|manager_live_read_unavailable|internal_api_unavailable|configuration_failure|lineoa_operation_busy) candidate_count=\d+ scanned_chat_count=\d+ safe_match_count=\d+$') {
        throw 'Worker output unavailable'
    }
    Write-Output $output[0]
    exit $exitCode
} catch {
    Write-Output 'status=configuration_failure candidate_count=0 scanned_chat_count=0 safe_match_count=0'
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('N8N_INTERNAL_TOKEN', $priorToken, 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONDONTWRITEBYTECODE', $priorNoBytecode, 'Process')
}
