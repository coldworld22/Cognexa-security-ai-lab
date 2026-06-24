param(
  [string]$OutputDir,
  [string]$ApiBaseUrl,
  [string]$AgentId = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  $line = Get-Content -Path $Path | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return ($line -split "=", 2)[1]
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$templateDir = Join-Path $PSScriptRoot "endpoint-agent-package-template"
$heartbeatScriptPath = Join-Path $PSScriptRoot "windows-endpoint-heartbeat.ps1"
$envPath = Join-Path $repoRoot "backend\.env"

if (-not (Test-Path $envPath)) {
  throw "backend\.env was not found."
}

$enrollmentToken = Get-EnvValue -Path $envPath -Key "ENDPOINT_ENROLLMENT_TOKEN"
if (-not $enrollmentToken) {
  throw "ENDPOINT_ENROLLMENT_TOKEN was not found in backend\.env."
}

if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRoot "dist\endpoint-agent-package"
}

if (-not $ApiBaseUrl) {
  $defaultRoute = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1

  if (-not $defaultRoute) {
    throw "Could not determine the default route interface. Pass -ApiBaseUrl explicitly."
  }

  $ipAddress = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $defaultRoute.InterfaceIndex |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*"
    } |
    Select-Object -First 1 -ExpandProperty IPAddress

  if (-not $ipAddress) {
    throw "Could not determine the host IPv4 address for the default route. Pass -ApiBaseUrl explicitly."
  }

  $ApiBaseUrl = "http://${ipAddress}:5000/api/v1"
}

if (Test-Path $OutputDir) {
  Remove-Item -Path $OutputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Copy-Item -Path (Join-Path $templateDir "*") -Destination $OutputDir -Recurse -Force
Copy-Item -Path $heartbeatScriptPath -Destination (Join-Path $OutputDir "windows-endpoint-heartbeat.ps1") -Force

$config = @{
  ApiBaseUrl = $ApiBaseUrl
  EnrollmentToken = $enrollmentToken
  AgentId = $AgentId
  TaskName = "SecurityAiLabEndpointHeartbeat"
  InstallDir = 'C:\ProgramData\SecurityAiLab\EndpointAgent'
  RemoteAccess = @{
    provider = "guacamole"
    mode = "embedded"
    label = "Open remote session"
    launchUrl = ""
  }
  BuiltAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 4

Set-Content -Path (Join-Path $OutputDir "agent-config.json") -Value $config -Encoding UTF8

Write-Host "Built endpoint agent package." -ForegroundColor Green
Write-Host "Output: $OutputDir"
Write-Host "API URL: $ApiBaseUrl"
