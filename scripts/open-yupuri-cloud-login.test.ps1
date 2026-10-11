$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'open-yupuri-cloud-login.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Login opener parse failed' }
foreach ($name in @('Assert-ToolboxAutomationWindowOpen', 'Get-UserDataDirFlags', 'Get-DedicatedProcesses', 'Get-DedicatedRootProcess')) {
    $functions = @($ast.FindAll({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true))
    if ($functions.Count -ne 1) { throw "Dedicated process function $name missing" }
    . ([scriptblock]::Create($functions[0].Extent.Text))
}
$sourceText = Get-Content -LiteralPath $source -Raw -Encoding UTF8
if ($sourceText -cnotmatch '(?m)^\s*Assert-ToolboxAutomationWindowOpen\s*\r?\n\s*Start-Process -FilePath \$edge -ArgumentList \$arguments') {
    throw 'Fresh service-hours guard must immediately precede Edge Start-Process'
}
function UtcFixture([string]$Value) {
    [DateTime]::SpecifyKind([DateTime]::Parse($Value), [DateTimeKind]::Utc)
}
foreach ($value in @('2026-10-10T20:59:59.999', '2026-10-11T14:55:00.000', '2026-10-11T15:00:00.000')) {
    try { Assert-ToolboxAutomationWindowOpen (UtcFixture $value) }
    catch { continue }
    throw "Closed-hour Edge launch accepted: $value"
}
foreach ($value in @('2026-10-10T21:00:00.000', '2026-10-11T14:54:59.999')) {
    Assert-ToolboxAutomationWindowOpen (UtcFixture $value)
}
$profile = 'C:\Users\test\AppData\Local\clock-repair-system\yupuri-cloud\edge-profile'
$port = 18822
$rootLine = 'msedge.exe --user-data-dir="' + $profile + '" --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1'
function New-EdgeFixture([int]$Id, [string]$Line) {
    [pscustomobject]@{ ProcessId = $Id; CommandLine = $Line }
}
$root = New-EdgeFixture 101 $rootLine
$renderer = New-EdgeFixture 102 ('msedge.exe --type=renderer --user-data-dir="' + $profile + '"')
$crashpad = New-EdgeFixture 103 ('msedge.exe --type=crashpad-handler --user-data-dir="' + $profile + '" --remote-debugging-address=127.0.0.1')
$normal = New-EdgeFixture 202 'msedge.exe --user-data-dir="C:\Users\test\AppData\Local\Microsoft\Edge\User Data" --remote-debugging-port=18822'
$script:processes = @($normal, $root, $renderer, $crashpad)
function Get-CimInstance {
    param([string]$Filter)
    if ($Filter -match 'ProcessId = (\d+)') {
        return @($script:processes | Where-Object { $_.ProcessId -eq [int]$Matches[1] })
    }
    return $script:processes
}
function Assert-Rejected([string]$Reason) {
    try { $exact = @(Get-DedicatedProcesses); Get-DedicatedRootProcess $exact | Out-Null }
    catch { return }
    throw "Unsafe root accepted: $Reason"
}
$exact = @(Get-DedicatedProcesses)
if ($exact.Count -ne 3 -or @(Get-DedicatedRootProcess $exact).Count -ne 1 -or
    (Get-DedicatedRootProcess $exact).ProcessId -ne 101) {
    throw 'Only the dedicated browser root should be selected for stop'
}
if (@(Get-DedicatedProcesses -TargetProcessId 202).Count -ne 0 -or
    @(Get-DedicatedProcesses -TargetProcessId 101).Count -ne 1 -or
    @(Get-DedicatedProcesses -TargetProcessId 102).Count -ne 1 -or
    @(Get-DedicatedProcesses -TargetProcessId 103).Count -ne 1) {
    throw 'Exact-profile children or normal Edge were misclassified'
}
$noSpaceProfile = 'C:\edge-profile'
$spaceProfile = 'C:\Users\test user\edge-profile'
foreach ($spelling in @(
    ('--user-data-dir=' + $profile),
    ('--user-data-dir="' + $spaceProfile + '"'),
    ('"--user-data-dir=' + $spaceProfile + '"'),
    ('"--user-data-dir=' + $noSpaceProfile + '"')
)) {
    $expected = if ($spelling.Contains($noSpaceProfile)) { $noSpaceProfile } elseif ($spelling.Contains($spaceProfile)) { $spaceProfile } else { $profile }
    $profile = $expected
    $script:processes = @((New-EdgeFixture 301 ('msedge.exe ' + $spelling + ' --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1')))
    if ((Get-DedicatedRootProcess @(Get-DedicatedProcesses)).ProcessId -ne 301) { throw "Exact profile spelling missed: $spelling" }
    $profile = 'C:\Users\test\AppData\Local\clock-repair-system\yupuri-cloud\edge-profile'
}
$script:processes = @($renderer, $crashpad)
Assert-Rejected 'child-only/no root'
$script:processes = @($root, (New-EdgeFixture 104 $rootLine))
Assert-Rejected 'duplicate roots'
$script:processes = @($root, (New-EdgeFixture 105 ('msedge.exe --user-data-dir="' + $profile + '" --remote-debugging-port=18823 --remote-debugging-address=127.0.0.1')))
Assert-Rejected 'valid root plus mismatched root'
foreach ($line in @(
    ('msedge.exe --user-data-dir="' + $profile + '" --remote-debugging-port=18823 --remote-debugging-address=127.0.0.1'),
    ('msedge.exe --user-data-dir="' + $profile + '" --remote-debugging-port=18822 --remote-debugging-address=0.0.0.0'),
    ('msedge.exe --user-data-dir="' + $profile + '" --remote-debugging-address=127.0.0.1'),
    ('msedge.exe --user-data-dir="C:\Users\test\normal" --user-data-dir="' + $profile + '" --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1')
    ('msedge.exe "--user-data-dir=' + $profile + '" --user-data-dir=C:\other --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1'),
    ('msedge.exe "--user-data-dir=' + $profile + '" --user-data-dir= --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1')
)) {
    $script:processes = @((New-EdgeFixture 303 $line))
    Assert-Rejected $line
}
$script:processes = @($normal)
if (@(Get-DedicatedProcesses).Count -ne 0) { throw 'Normal Edge was selected' }
foreach ($line in @(
    ('msedge.exe --user-data-dir="' + $profile + '-other" --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1'),
    ('msedge.exe --user-data-dir=' + $profile + '-other --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1'),
    ('msedge.exe --other-user-data-dir=' + $profile + ' --remote-debugging-port=18822 --remote-debugging-address=127.0.0.1')
)) {
    $script:processes = @((New-EdgeFixture 404 $line))
    if (@(Get-DedicatedProcesses).Count -ne 0) { throw "Lookalike profile selected: $line" }
}
'Dedicated Edge process fixture PASS'
