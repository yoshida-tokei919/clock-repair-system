$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'install-yupuri-cloud-worker-task.ps1'
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("task201g-installer-" + [guid]::NewGuid().ToString('N'))
$gateScript = Join-Path $fixture 'installer-under-test.ps1'
New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts') -Force | Out-Null
try {
    # Substitute the canonical path and runtime identity/token in a private
    # fixture. All Scheduled Task commands below are local stubs.
    $content = (Get-Content -LiteralPath $source -Raw -Encoding utf8).Replace(
        'C:\Users\yoshi\clock-repair-system', $fixture).Replace(
        "`$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')", "`$token = 'fixture-token'").Replace(
        "`$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name", "`$user = 'fixture-user'")
    Set-Content -LiteralPath $gateScript -Value $content -Encoding utf8
    Set-Content -LiteralPath (Join-Path $fixture 'package.json') -Value '{}' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $fixture 'scripts\start-yupuri-cloud-worker.ps1') -Value '# fixture' -Encoding utf8
    & git.exe init --initial-branch main $fixture 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'Fixture git init failed' }
    & git.exe -C $fixture -c user.name=Task201G -c user.email=task201g@example.invalid add .
    & git.exe -C $fixture -c user.name=Task201G -c user.email=task201g@example.invalid commit -m 'fixture main' 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'Fixture commit failed' }
    $ancestor = (& git.exe -C $fixture rev-parse HEAD).Trim()
    New-Item -ItemType Directory -Path (Join-Path $fixture 'docs\ai-tasks') -Force | Out-Null
    $taskFiles = @('scripts/install-yupuri-cloud-worker-task.ps1', 'scripts/start-yupuri-cloud-worker.ps1',
        'scripts/yupuri-cloud-live-session.ts', 'scripts/yupuri-cloud-worker.ts',
        'docs/ai-tasks/201g-yu-pri-cloud-operational-hardening.md')
    foreach ($file in $taskFiles) {
        $target = Join-Path $fixture $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) $file) -Destination $target -Force
    }
    & git.exe -C $fixture add .
    & git.exe -C $fixture -c user.name=Task201G -c user.email=task201g@example.invalid commit -m 'reviewed fixture' 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'Reviewed fixture commit failed' }
    & git.exe -C $fixture remote add origin https://github.com/yoshida-tokei919/clock-repair-system
    $mainHead = (& git.exe -C $fixture rev-parse HEAD).Trim()
    & git.exe -C $fixture update-ref refs/remotes/origin/main $mainHead
    $fixtureTree = (& git.exe -C $fixture rev-parse "${mainHead}^{tree}").Trim()
    $nonAncestor = (& git.exe -C $fixture -c user.name=Task201G -c user.email=task201g@example.invalid commit-tree $fixtureTree -m unrelated).Trim()

    function git {
        if ($args -contains 'ls-remote') {
            "$mainHead`trefs/heads/main"
            $global:LASTEXITCODE = 0
            return
        }
        & git.exe @args
    }
    $global:registrationCalls = 0
    $global:enableCalls = 0
    function New-ScheduledTaskAction { [pscustomobject]@{ kind = 'action' } }
    function New-ScheduledTaskTrigger { [pscustomobject]@{ kind = 'trigger' } }
    function New-ScheduledTaskPrincipal { [pscustomobject]@{ kind = 'principal' } }
    function New-ScheduledTaskSettingsSet { [pscustomobject]@{ kind = 'settings' } }
    function Register-ScheduledTask { $global:registrationCalls++; [pscustomobject]@{ kind = 'registered' } }
    function Enable-ScheduledTask { $global:enableCalls++; [pscustomobject]@{ kind = 'enabled' } }
    function Assert-Rejected([string]$reviewed, [string]$expected) {
        try {
            if ($reviewed) { & $gateScript -Enable -RepoRoot $fixture -ReviewedCommit $reviewed }
            else { & $gateScript -Enable -RepoRoot $fixture }
        }
        catch {
            if ($_.Exception.Message -notmatch $expected) { throw }
            if ($global:registrationCalls -ne 0 -or $global:enableCalls -ne 0) { throw 'Rejected source reached Scheduled Task registration' }
            return
        }
        throw "Expected gate rejection: $expected"
    }
    Assert-Rejected '' 'requires -ReviewedCommit'
    Assert-Rejected 'not-a-commit' 'requires -ReviewedCommit'
    Assert-Rejected $nonAncestor 'does not match canonical HEAD'
    Assert-Rejected $ancestor 'does not match canonical HEAD'
    $result = & $gateScript -Enable -RepoRoot $fixture -ReviewedCommit $mainHead
    if ($result -notmatch 'status=enabled' -or $global:registrationCalls -ne 1 -or $global:enableCalls -ne 1) {
        throw 'Valid reviewed HEAD did not pass all source gates'
    }
    'Installer reviewed-commit gates PASS (missing, invalid, non-HEAD ancestor, non-ancestor, positive source gate)'
} finally {
    $resolved = [System.IO.Path]::GetFullPath($fixture)
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Fixture cleanup path escaped the temporary directory'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
