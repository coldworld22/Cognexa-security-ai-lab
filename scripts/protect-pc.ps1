[CmdletBinding()]
param(
  [ValidateSet("Activate", "Deactivate", "Status")]
  [string]$Action = "Activate",
  [string]$ApiBaseUrl = $(if ($env:SECURITY_AI_LAB_API_URL) {
      $env:SECURITY_AI_LAB_API_URL
    } else {
      "http://localhost:5000/api/v1"
    }),
  [string]$AccessToken = $env:SECURITY_AI_LAB_ACCESS_TOKEN,
  [string]$TorrcPath = "$env:APPDATA\tor\torrc",
  [int]$SocksPort = 9050,
  [int]$ControlPort = 9051,
  [int]$DnsPort = 9053,
  [switch]$SkipTorBootstrap
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Set-UserProxyEnvironment {
  param([string]$ProxyUrl)

  foreach ($name in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")) {
    [Environment]::SetEnvironmentVariable($name, $ProxyUrl, "User")
  }

  [Environment]::SetEnvironmentVariable(
    "NO_PROXY",
    "localhost,127.0.0.1,<local>",
    "User"
  )
}

function Clear-UserProxyEnvironment {
  foreach ($name in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY")) {
    [Environment]::SetEnvironmentVariable($name, $null, "User")
  }
}

function Resolve-AccessToken {
  if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    throw "Provide -AccessToken or set SECURITY_AI_LAB_ACCESS_TOKEN before running this script."
  }

  return $AccessToken.Trim()
}

function Invoke-ProtectionApi {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("GET", "POST")]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [object]$Body
  )

  $headers = @{
    Authorization = "Bearer $(Resolve-AccessToken)"
  }
  $uri = "$($ApiBaseUrl.TrimEnd('/'))$Path"

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }

  $headers["Content-Type"] = "application/json"
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body ($Body | ConvertTo-Json -Depth 8)
}

function Write-ProtectionStatus {
  param([Parameter(Mandatory = $true)] [psobject]$Status)

  $exitIp = $Status.cloakingVerification.exitIdentity.ip
  if ([string]::IsNullOrWhiteSpace($exitIp)) {
    $exitIp = $Status.cloakingVerification.exitIp
  }
  if ([string]::IsNullOrWhiteSpace($exitIp)) {
    $exitIp = "unknown"
  }

  $stackPassed = $false
  if ($null -ne $Status.fullProtectionVerification) {
    $stackPassed = [bool]$Status.fullProtectionVerification.passed
  }

  Write-Host ""
  Write-Host "Protection active: $($Status.active)" -ForegroundColor Green
  Write-Host "Protection level: $($Status.protectionLevel)" -ForegroundColor Green
  Write-Host "Route verified: $($Status.routeVerified)" -ForegroundColor Green
  Write-Host "Transport secure: $($Status.transportSecure)" -ForegroundColor Green
  Write-Host "Tor exit IP: $exitIp" -ForegroundColor Yellow
  Write-Host "Windows stack verified: $stackPassed" -ForegroundColor Yellow

  if ($Status.advisories.Count -gt 0) {
    Write-Host "Advisories: $($Status.advisories -join ', ')" -ForegroundColor Yellow
  }
}

Resolve-AccessToken | Out-Null

if ($Action -eq "Activate" -and -not $SkipTorBootstrap) {
  Write-Step "Preparing local Tor listener configuration"
  & (Join-Path $PSScriptRoot "setup-full-protection.ps1") `
    -TorrcPath $TorrcPath `
    -SocksPort $SocksPort `
    -ControlPort $ControlPort `
    -DnsPort $DnsPort
}

switch ($Action) {
  "Activate" {
    Write-Step "Activating the backend protection stack"
    $response = Invoke-ProtectionApi -Method "POST" -Path "/protection/activate" -Body @{
      outboundStrategy = "tor"
      torControlPort = $ControlPort
      torSocksPort = $SocksPort
      dnsOverTor = $true
      circuitRotationInterval = 300
      tlsFingerprintProfile = "browser"
      enabledCategories = @(
        "security_research",
        "vulnerability_analysis",
        "external_url_access"
      )
    }
    Set-UserProxyEnvironment -ProxyUrl "http://127.0.0.1:9080"
    Write-ProtectionStatus -Status $response.status
  }
  "Deactivate" {
    Write-Step "Deactivating the backend protection stack"
    try {
      $response = Invoke-ProtectionApi -Method "POST" -Path "/protection/deactivate"
    } finally {
      Clear-UserProxyEnvironment
    }
    Write-ProtectionStatus -Status $response.status
  }
  "Status" {
    Write-Step "Checking protection status"
    $response = Invoke-ProtectionApi -Method "GET" -Path "/protection/status"
    Write-ProtectionStatus -Status $response.status
  }
}

Write-Host ""
if ($Action -eq "Activate") {
  Write-Host "Proxy environment variables were written to the current user profile." -ForegroundColor Yellow
  Write-Host "Open a new terminal window before testing curl.exe without explicit --proxy flags." -ForegroundColor Yellow
} elseif ($Action -eq "Deactivate") {
  Write-Host "Proxy environment variables were removed from the current user profile." -ForegroundColor Yellow
}
