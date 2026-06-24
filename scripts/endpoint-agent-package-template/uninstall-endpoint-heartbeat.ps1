param(
  [string]$InstallDir,
  [string]$TaskName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  $argumentList = @(
    "-NoProfile"
    "-ExecutionPolicy"
    "Bypass"
    "-File"
    "`"$PSCommandPath`""
  )

  if ($InstallDir) {
    $argumentList += @("-InstallDir", "`"$InstallDir`"")
  }

  if ($TaskName) {
    $argumentList += @("-TaskName", "`"$TaskName`"")
  }

  Start-Process -FilePath "powershell.exe" -ArgumentList ($argumentList -join " ") -Verb RunAs
  exit 0
}

$packageDir = Split-Path -Parent $PSCommandPath
$configPath = Join-Path $packageDir "agent-config.json"
$config = if (Test-Path $configPath) {
  Get-Content -Path $configPath -Raw | ConvertFrom-Json
} else {
  $null
}

$resolvedInstallDir =
  if ($InstallDir) { $InstallDir }
  elseif ($config -and $config.InstallDir) { [string]$config.InstallDir }
  else { Join-Path $env:ProgramData "SecurityAiLab\EndpointAgent" }

$resolvedTaskName =
  if ($TaskName) { $TaskName }
  elseif ($config -and $config.TaskName) { [string]$config.TaskName }
  else { "SecurityAiLabEndpointHeartbeat" }

& schtasks.exe /Delete /TN $resolvedTaskName /F | Out-Null

if (Test-Path $resolvedInstallDir) {
  Remove-Item -Path $resolvedInstallDir -Recurse -Force
}

Write-Host "Removed endpoint heartbeat agent." -ForegroundColor Yellow
Write-Host "Install directory: $resolvedInstallDir"
Write-Host "Scheduled task: $resolvedTaskName"
