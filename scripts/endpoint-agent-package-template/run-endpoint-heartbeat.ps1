Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installDir = Split-Path -Parent $PSCommandPath
$configPath = Join-Path $installDir "agent-config.json"
$heartbeatScriptPath = Join-Path $installDir "windows-endpoint-heartbeat.ps1"

if (-not (Test-Path $configPath)) {
  throw "agent-config.json was not found."
}

if (-not (Test-Path $heartbeatScriptPath)) {
  throw "windows-endpoint-heartbeat.ps1 was not found."
}

$config = Get-Content -Path $configPath -Raw | ConvertFrom-Json

$invokeParams = @{
  ApiBaseUrl = [string]$config.ApiBaseUrl
  EnrollmentToken = [string]$config.EnrollmentToken
}

if ($config.AgentId) {
  $invokeParams.AgentId = [string]$config.AgentId
}

if ($config.RemoteAccess -and $config.RemoteAccess.launchUrl) {
  $invokeParams.RemoteAccessJson = ($config.RemoteAccess | ConvertTo-Json -Depth 6 -Compress)
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $heartbeatScriptPath @invokeParams
