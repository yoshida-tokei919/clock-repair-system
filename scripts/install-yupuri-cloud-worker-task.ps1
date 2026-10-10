param(
    [switch]$Enable,
    [switch]$AllowIssue,
    [string]$ReviewedCommit,
    [string]$RepoRoot = (Join-Path $HOME 'clock-repair-system')
)
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$canonicalRepo = [System.IO.Path]::GetFullPath('C:\Users\yoshi\clock-repair-system')
if (-not [string]::Equals($repo.TrimEnd('\'), $canonicalRepo.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Enabled registration requires the canonical stable repository path'
}
if (Test-Path -LiteralPath $repo -PathType Container) {
    $repoItem = Get-Item -LiteralPath $repo -Force
    if (($repoItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Production repository root cannot be a link or junction'
    }
}
$launcher = Join-Path $repo 'scripts\start-yupuri-cloud-worker.ps1'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $repo 'package.json') -PathType Leaf)) {
    throw 'Stable worker repository is unavailable'
}
if (-not $Enable) {
    Write-Output "status=preview; repo=$repo; registration requires -Enable and -ReviewedCommit; issuance requires -AllowIssue"
    return
}
if ($ReviewedCommit -cnotmatch '^[0-9a-fA-F]{40}$') {
    throw 'Enabled registration requires -ReviewedCommit with a full 40-hex commit ID'
}
# Rollout supplies the independently reviewed exact canonical HEAD.
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git') -PathType Container)) {
    throw 'Canonical repository metadata is unavailable'
}
$root = & git -C $repo rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or -not [string]::Equals([System.IO.Path]::GetFullPath($root), $canonicalRepo, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Canonical Git root validation failed'
}
$origin = & git -C $repo remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^https://github\.com/yoshida-tokei919/clock-repair-system(?:\.git)?$') {
    throw 'Canonical Git origin validation failed'
}
$branch = & git -C $repo symbolic-ref --short HEAD 2>$null
if ($LASTEXITCODE -ne 0 -or $branch -cne 'main') { throw 'Canonical repository must be on main' }
$head = & git -C $repo rev-parse HEAD 2>$null
$reviewedRef = & git -C $repo rev-parse refs/remotes/origin/main 2>$null
if ($LASTEXITCODE -ne 0 -or $head -ne $reviewedRef) { throw 'Canonical main does not match origin/main' }
$remoteMain = & git -C $repo -c credential.interactive=never ls-remote --exit-code origin refs/heads/main 2>$null
if ($LASTEXITCODE -ne 0 -or $remoteMain -notmatch '^([0-9a-f]{40})\s+refs/heads/main$' -or $head -cne $Matches[1]) {
    throw 'Canonical main does not match the remote reviewed source'
}
$changes = & git -C $repo status --porcelain --untracked-files=all 2>$null
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Canonical repository has unreviewed local changes' }
$reviewedType = & git -C $repo cat-file -t $ReviewedCommit 2>$null
if ($LASTEXITCODE -ne 0 -or $reviewedType -cne 'commit') { throw 'Reviewed commit does not resolve to a commit' }
if ($ReviewedCommit -cne $head) { throw 'Reviewed commit does not match canonical HEAD' }
$reviewedFiles = @(& git -C $repo diff-tree --no-commit-id --name-only -r $ReviewedCommit 2>$null)
if ($LASTEXITCODE -ne 0 -or
    $reviewedFiles -cnotcontains 'scripts/yupuri-cloud-live-session.ts' -or
    $reviewedFiles -cnotcontains 'docs/ai-tasks/201g-yu-pri-cloud-operational-hardening.md') {
    throw 'Reviewed commit does not contain the Task201G correction files'
}
$reviewedSession = & git -C $repo show "${ReviewedCommit}:scripts/yupuri-cloud-live-session.ts" 2>$null
if ($LASTEXITCODE -ne 0 -or ($reviewedSession -join "`n") -cnotmatch '(?m)^export const CLOUD_LOGIN_LOCK_PROTOCOL = 2;$') {
    throw 'Reviewed commit does not contain the corrected Cloud login protocol'
}
$reviewedTask = & git -C $repo show "${ReviewedCommit}:docs/ai-tasks/201g-yu-pri-cloud-operational-hardening.md" 2>$null
if ($LASTEXITCODE -ne 0 -or ($reviewedTask -join "`n") -cnotmatch 'Fresh SSO proof required before clearing auto-login-attempted') {
    throw 'Reviewed commit does not contain the Task201G safety record'
}
$required = @('docs/ai-tasks/201g-yu-pri-cloud-operational-hardening.md',
    'scripts/install-yupuri-cloud-worker-task.ps1', 'scripts/start-yupuri-cloud-worker.ps1',
    'scripts/yupuri-cloud-live-session.ts', 'scripts/yupuri-cloud-worker.ts')
& git -C $repo ls-files --error-unmatch -- $required 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Reviewed worker source files are missing' }
$sessionSource = Get-Content -LiteralPath (Join-Path $repo 'scripts/yupuri-cloud-live-session.ts') -Raw -Encoding utf8
if ($sessionSource -notmatch '(?m)^export const CLOUD_LOGIN_LOCK_PROTOCOL = 2;$') {
    throw 'Reviewed Cloud login lock protocol is missing'
}
$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) { throw 'User N8N_INTERNAL_TOKEN is unavailable' }
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escaped = $launcher.Replace('"', '""')
$argument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escaped`""
if ($AllowIssue) { $argument += ' -AllowIssue' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3 -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName 'ClockRepair-YuPriCloudWorker' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Enable-ScheduledTask -TaskName 'ClockRepair-YuPriCloudWorker' | Out-Null
Write-Output "status=enabled; allowIssue=$([bool]$AllowIssue)"
