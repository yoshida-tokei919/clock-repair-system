[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("status", "pending", "detail", "save", "clear-cache")]
  [string]$Action,
  [string]$InquiryId,
  [string]$Limit,
  [switch]$Local
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom

$ProductionOrigin = "https://yoshidawatchrepair.com"
$LocalOrigin = "http://127.0.0.1:3000"
$Origin = if ($Local) { $LocalOrigin } else { $ProductionOrigin }

if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
  throw "LOCALAPPDATA is not configured."
}

$CacheRoot = Join-Path $env:LOCALAPPDATA "clock-repair-system\inquiry-ai-cache"
$OutboxRoot = Join-Path $env:LOCALAPPDATA "clock-repair-system\inquiry-ai-outbox"

function Ensure-BridgeDirectories() {
  New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $OutboxRoot -Force | Out-Null
}

Ensure-BridgeDirectories

function Write-BridgeJson([object]$Value) {
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Depth 100 -Compress))
}

function Stop-Bridge([string]$Message) {
  Write-BridgeJson ([ordered]@{ ok = $false; error = $Message })
  exit 1
}

function Stop-TransportFailure() {
  Write-BridgeJson ([ordered]@{ ok = $false; error = "Inquiry AI request failed" })
  exit 1
}

function Test-ArgumentProvided([string]$Value) {
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Get-InquiryId() {
  if ([string]::IsNullOrWhiteSpace($InquiryId) -or $InquiryId -notmatch '^[1-9][0-9]*$') {
    Stop-Bridge "InquiryId must be a positive integer."
  }
  try { $parsed = [Int64]::Parse($InquiryId, [Globalization.CultureInfo]::InvariantCulture) }
  catch { Stop-Bridge "InquiryId must be a positive integer." }
  if ($parsed -lt 1 -or $parsed -gt 9007199254740991) {
    Stop-Bridge "InquiryId must be a positive integer."
  }
  return $parsed
}

function Get-Limit() {
  if ([string]::IsNullOrWhiteSpace($Limit) -or $Limit -notmatch '^[1-9][0-9]*$') {
    Stop-Bridge "Limit must be an integer from 1 to 50."
  }
  try { $parsed = [Int32]::Parse($Limit, [Globalization.CultureInfo]::InvariantCulture) }
  catch { Stop-Bridge "Limit must be an integer from 1 to 50." }
  if ($parsed -lt 1 -or $parsed -gt 50) { Stop-Bridge "Limit must be an integer from 1 to 50." }
  return $parsed
}

function Get-BridgeToken() {
  $value = $env:N8N_INTERNAL_TOKEN
  if (-not $Local -and [string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable("N8N_INTERNAL_TOKEN", "User")
  }
  if (-not $Local -and [string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable("N8N_INTERNAL_TOKEN", "Machine")
  }
  return $value
}

function Get-CacheDirectory([Int64]$Id) {
  return (Join-Path $CacheRoot ("I-" + $Id))
}

function Get-OutboxPath([Int64]$Id) {
  return (Join-Path $OutboxRoot ("I-" + $Id + ".json"))
}

function Remove-DirectoryIfPresent([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Remove-ExpiredCacheFolders() {
  if (-not (Test-Path -LiteralPath $CacheRoot)) { return }
  $cutoff = (Get-Date).AddHours(-24)
  Get-ChildItem -LiteralPath $CacheRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
      try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop } catch { }
    }
}

function Get-ImageExtension([object]$MimeType) {
  switch ("$MimeType".ToLowerInvariant()) {
    "image/webp" { return ".webp" }
    "image/jpeg" { return ".jpg" }
    "image/jpg" { return ".jpg" }
    "image/png" { return ".png" }
    "image/gif" { return ".gif" }
    default { return ".bin" }
  }
}

function Get-ErrorResponse([System.Management.Automation.ErrorRecord]$Failure) {
  $responseProperty = $Failure.Exception.PSObject.Properties["Response"]
  if ($null -eq $responseProperty) { return $null }
  $response = $responseProperty.Value
  if ($null -eq $response) { return $null }
  $status = [int]$response.StatusCode
  $body = $null
  try {
    $reader = New-Object IO.StreamReader($response.GetResponseStream())
    try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
  } catch { }
  return [pscustomobject]@{ Status = $status; Body = $body }
}

function Get-SanitizedHttpResult([object]$HttpError) {
  $status = [int]$HttpError.Status
  $error = "Request failed"
  if ($status -eq 400) { $error = "Request rejected" }
  elseif ($status -eq 401) { $error = "Unauthorized" }
  elseif ($status -eq 404) { $error = "Not found" }
  elseif ($status -eq 409) {
    if ($HttpError.Body -match 'AI input context has changed') { $error = "stale" }
    else { $error = "Conflict" }
  }
  elseif ($status -eq 503) { $error = "Server token configuration unavailable" }
  return [ordered]@{ ok = $false; httpStatus = $status; error = $error }
}

function Invoke-InquiryApi([string]$Method, [string]$Path, [AllowNull()][object]$Body) {
  $token = Get-BridgeToken
  if ([string]::IsNullOrWhiteSpace($token)) { Stop-Bridge "N8N_INTERNAL_TOKEN is not configured." }
  $headers = @{ Authorization = ("Bearer " + $token); Accept = "application/json" }
  $uri = $Origin + $Path
  try {
    $parameters = @{ Uri = $uri; Method = $Method; Headers = $headers; UseBasicParsing = $true; ErrorAction = "Stop" }
    if ($null -ne $Body) {
      $parameters["Body"] = [Text.Encoding]::UTF8.GetBytes($Body)
      $parameters["ContentType"] = "application/json; charset=utf-8"
    }
    $response = Invoke-WebRequest @parameters
    return [pscustomobject]@{ Ok = $true; Status = [int]$response.StatusCode; Data = ($response.Content | ConvertFrom-Json) }
  } catch {
    $httpError = Get-ErrorResponse $_
    if ($null -ne $httpError) { return [pscustomobject]@{ Ok = $false; HttpError = $httpError; TransportFailure = $false } }
    return [pscustomobject]@{ Ok = $false; TransportFailure = $true }
  }
}

function Remove-SignedReadUrls([object]$Value) {
  if ($null -eq $Value) { return }
  if ($Value -is [System.Collections.IDictionary]) {
    $Value.Remove("signedReadUrl")
    foreach ($item in @($Value.Values)) { Remove-SignedReadUrls $item }
    return
  }
  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    foreach ($item in $Value) { Remove-SignedReadUrls $item }
    return
  }
  $property = $Value.PSObject.Properties["signedReadUrl"]
  if ($null -ne $property) { $Value.PSObject.Properties.Remove("signedReadUrl") }
  foreach ($child in @($Value.PSObject.Properties | ForEach-Object { $_.Value })) {
    Remove-SignedReadUrls $child
  }
}

function Invoke-Detail([Int64]$Id) {
  $result = Invoke-InquiryApi "GET" ("/api/internal/inquiry-ai/" + $Id) $null
  if (-not $result.Ok) {
    if ($result.TransportFailure) { Stop-TransportFailure }
    Write-BridgeJson (Get-SanitizedHttpResult $result.HttpError)
    return
  }

  Remove-ExpiredCacheFolders
  $inquiryCache = Get-CacheDirectory $Id
  Remove-DirectoryIfPresent $inquiryCache
  New-Item -ItemType Directory -Path $inquiryCache -Force | Out-Null

  foreach ($file in @($result.Data.inquiry.files)) {
    $signedUrl = $file.signedReadUrl
    if (-not [string]::IsNullOrWhiteSpace($signedUrl)) {
      $fileId = [Int64]$file.id
      $destination = Join-Path $inquiryCache ("F-" + $fileId + (Get-ImageExtension $file.mimeType))
      try {
        Invoke-WebRequest -Uri $signedUrl -OutFile $destination -UseBasicParsing -ErrorAction Stop
        $file | Add-Member -NotePropertyName localImagePath -NotePropertyValue $destination -Force
      } catch {
        $file | Add-Member -NotePropertyName downloadError -NotePropertyValue "Image download failed" -Force
      }
    }
  }
  Remove-SignedReadUrls $result.Data
  Write-BridgeJson $result.Data
}

function Invoke-Save([Int64]$Id) {
  $outboxPath = Get-OutboxPath $Id
  if (-not (Test-Path -LiteralPath $outboxPath -PathType Leaf)) { Stop-Bridge "Outbox payload is missing." }
  try {
    $payload = Get-Content -LiteralPath $outboxPath -Raw -Encoding UTF8
    try { $parsed = $payload | ConvertFrom-Json -ErrorAction Stop } catch { Stop-Bridge "Outbox payload is not valid JSON." }
    if ($null -eq $parsed -or $parsed -isnot [System.Management.Automation.PSCustomObject]) {
      Stop-Bridge "Outbox payload must be a JSON object."
    }
    $result = Invoke-InquiryApi "POST" ("/api/internal/inquiry-ai/" + $Id + "/analysis") $payload
    if (-not $result.Ok) {
      if ($result.TransportFailure) { Stop-TransportFailure }
      Write-BridgeJson (Get-SanitizedHttpResult $result.HttpError)
      return
    }
    Write-BridgeJson ([ordered]@{
      ok = [bool]$result.Data.ok
      httpStatus = $result.Status
      deduplicated = [bool]$result.Data.deduplicated
      analysisId = $result.Data.analysis.id
      status = $result.Data.analysis.status
      error = $null
    })
  } finally {
    try { Remove-Item -LiteralPath $outboxPath -Force -ErrorAction SilentlyContinue } catch { }
  }
}

switch ($Action) {
  "status" {
    if ((Test-ArgumentProvided $InquiryId) -or (Test-ArgumentProvided $Limit)) { Stop-Bridge "status does not accept InquiryId or Limit." }
    Write-BridgeJson ([ordered]@{
      ok = $true
      mode = if ($Local) { "local" } else { "production" }
      productionOrigin = $ProductionOrigin
      tokenConfigured = -not [string]::IsNullOrWhiteSpace((Get-BridgeToken))
      cacheRoot = $CacheRoot
      outboxRoot = $OutboxRoot
    })
  }
  "pending" {
    if (Test-ArgumentProvided $InquiryId) { Stop-Bridge "InquiryId is not valid for pending." }
    $path = "/api/internal/inquiry-ai/pending"
    if (Test-ArgumentProvided $Limit) { $path += "?limit=" + (Get-Limit) }
    $result = Invoke-InquiryApi "GET" $path $null
    if ($result.Ok) { Write-BridgeJson $result.Data }
    elseif ($result.TransportFailure) { Stop-TransportFailure }
    else { Write-BridgeJson (Get-SanitizedHttpResult $result.HttpError) }
  }
  "detail" {
    if (Test-ArgumentProvided $Limit) { Stop-Bridge "Limit is only valid for pending." }
    Invoke-Detail (Get-InquiryId)
  }
  "save" {
    if (Test-ArgumentProvided $Limit) { Stop-Bridge "Limit is only valid for pending." }
    Invoke-Save (Get-InquiryId)
  }
  "clear-cache" {
    if (Test-ArgumentProvided $Limit) { Stop-Bridge "Limit is only valid for pending." }
    if (Test-ArgumentProvided $InquiryId) { Remove-DirectoryIfPresent (Get-CacheDirectory (Get-InquiryId)) }
    else { Remove-DirectoryIfPresent $CacheRoot }
    Write-BridgeJson ([ordered]@{ ok = $true })
  }
}
