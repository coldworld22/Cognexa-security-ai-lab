param(
  [string]$InstallDir,
  [string]$TaskName,
  [switch]$RunImmediately = $true
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

  if (-not $RunImmediately) {
    $argumentList += "-RunImmediately:`$false"
  }

  Start-Process -FilePath "powershell.exe" -ArgumentList ($argumentList -join " ") -Verb RunAs
  exit 0
}

$packageDir = Split-Path -Parent $PSCommandPath
$configPath = Join-Path $packageDir "agent-config.json"

if (-not (Test-Path $configPath)) {
  throw "agent-config.json was not found next to the installer."
}

$config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
$resolvedInstallDir =
  if ($InstallDir) { $InstallDir }
  elseif ($config.InstallDir) { [string]$config.InstallDir }
  else { Join-Path $env:ProgramData "SecurityAiLab\EndpointAgent" }

$resolvedTaskName =
  if ($TaskName) { $TaskName }
  elseif ($config.TaskName) { [string]$config.TaskName }
  else { "SecurityAiLabEndpointHeartbeat" }

New-Item -ItemType Directory -Path $resolvedInstallDir -Force | Out-Null

$filesToCopy = @(
  "agent-config.json",
  "run-endpoint-heartbeat.ps1",
  "windows-endpoint-heartbeat.ps1",
  "uninstall-endpoint-heartbeat.ps1",
  "uninstall-endpoint-heartbeat.bat",
  "README.txt"
)

foreach ($fileName in $filesToCopy) {
  Copy-Item -Path (Join-Path $packageDir $fileName) -Destination (Join-Path $resolvedInstallDir $fileName) -Force
}

$taskScriptPath = Join-Path $resolvedInstallDir "run-endpoint-heartbeat.ps1"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$taskScriptPath`""

& schtasks.exe /Create /TN $resolvedTaskName /TR $taskCommand /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to register scheduled task '$resolvedTaskName'."
}

if ($RunImmediately) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $taskScriptPath
}

Write-Host "Installed endpoint heartbeat agent." -ForegroundColor Green
Write-Host "Install directory: $resolvedInstallDir"
Write-Host "Scheduled task: $resolvedTaskName"
