$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "Security AI Lab.cmd"
$startScriptPath = Join-Path $repoRoot "scripts\start-dev.ps1"

if (-not (Test-Path -LiteralPath $startScriptPath)) {
  throw "Start script not found at $startScriptPath"
}

$launcherContent = @"
@echo off
cd /d "$repoRoot"
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$startScriptPath"
"@

Set-Content -LiteralPath $launcherPath -Value $launcherContent -Encoding Ascii

Write-Host "Installed Windows startup launcher:"
Write-Host $launcherPath
Write-Host ""
Write-Host "The app stack will start automatically the next time you sign in to Windows."
