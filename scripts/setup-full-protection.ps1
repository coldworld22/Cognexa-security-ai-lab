[CmdletBinding()]
param(
  [string]$TorrcPath = "$env:APPDATA\tor\torrc",
  [int]$SocksPort = 9050,
  [int]$ControlPort = 9051,
  [int]$DnsPort = 9053
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script as Administrator."
  }
}

function Resolve-TorrcPath {
  param([string]$RequestedPath)

  if (-not [string]::IsNullOrWhiteSpace($RequestedPath) -and (Test-Path -LiteralPath $RequestedPath)) {
    return $RequestedPath
  }

  $candidates = @(
    $RequestedPath,
    "$env:USERPROFILE\Desktop\Tor Browser\Browser\TorBrowser\Data\Tor\torrc",
    "$env:APPDATA\tor\torrc"
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $RequestedPath
}

function Ensure-Torrc {
  param(
    [string]$Path,
    [int]$Socks,
    [int]$Control,
    [int]$Dns
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $content = if (Test-Path -LiteralPath $Path) {
    Get-Content -LiteralPath $Path -Raw
  } else {
    ""
  }

  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in ($content -split "`r?`n")) {
    if ($line -match '^\s*(SocksPort|ControlPort|DNSPort)\s+') {
      continue
    }
    if ($line.Length -gt 0) {
      $lines.Add($line)
    }
  }

  $lines.Add("SocksPort $Socks")
  $lines.Add("ControlPort $Control")
  $lines.Add("DNSPort $Dns")
  $lines.Add("AutomapHostsOnResolve 1")
  $lines.Add("VirtualAddrNetworkIPv4 10.192.0.0/10")

  Set-Content -LiteralPath $Path -Value ($lines -join [Environment]::NewLine) -Encoding ASCII
}

function Restart-TorService {
  param([string]$ResolvedTorrcPath)

  $service = Get-Service | Where-Object { $_.Name -match '^tor' -or $_.DisplayName -match '^tor' } | Select-Object -First 1
  if (-not $service) {
    if ($ResolvedTorrcPath -like "*Tor Browser*") {
      Write-Warning "Tor Browser manages the active tor.exe instance itself. Fully exit Tor Browser and launch it again after updating torrc."
    } else {
      Write-Warning "No Tor Windows service was found. Start Tor manually after updating torrc."
    }
    return
  }

  if ($service.Status -eq "Running") {
    Restart-Service -Name $service.Name -Force
  } else {
    Start-Service -Name $service.Name
  }
}

function Ensure-FirewallPorts {
  param(
    [int]$Socks,
    [int]$Control,
    [int]$Dns
  )

  $rulePrefix = "Security AI Lab Bootstrap"
  foreach ($name in @(
    "$rulePrefix - Tor SOCKS",
    "$rulePrefix - Tor Control",
    "$rulePrefix - Tor DNS"
  )) {
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule | Out-Null
  }

  New-NetFirewallRule -DisplayName "$rulePrefix - Tor SOCKS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Socks -Profile Any | Out-Null
  New-NetFirewallRule -DisplayName "$rulePrefix - Tor Control" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Control -Profile Any | Out-Null
  New-NetFirewallRule -DisplayName "$rulePrefix - Tor DNS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Dns -Profile Any | Out-Null
  New-NetFirewallRule -DisplayName "$rulePrefix - Tor DNS (UDP)" -Direction Inbound -Action Allow -Protocol UDP -LocalPort $Dns -Profile Any | Out-Null
}

Ensure-Administrator
$TorrcPath = Resolve-TorrcPath -RequestedPath $TorrcPath

Write-Step "Preparing Tor listener configuration"
Ensure-Torrc -Path $TorrcPath -Socks $SocksPort -Control $ControlPort -Dns $DnsPort

Write-Step "Restarting the local Tor service when available"
Restart-TorService -ResolvedTorrcPath $TorrcPath

Write-Step "Opening local firewall ports for Tor listeners"
Ensure-FirewallPorts -Socks $SocksPort -Control $ControlPort -Dns $DnsPort

Write-Step "Setup complete"
Write-Host "Tor is configured for SocksPort $SocksPort, ControlPort $ControlPort, and DNSPort $DnsPort." -ForegroundColor Green
Write-Host "Updated torrc: $TorrcPath" -ForegroundColor Green
Write-Host "Start the backend and activate Private Mode to let the app pin WinINET/WinHTTP, browser shortcuts, and leak-prevention rules automatically." -ForegroundColor Green
