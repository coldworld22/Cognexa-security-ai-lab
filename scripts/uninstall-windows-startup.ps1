$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "Security AI Lab.cmd"

if (Test-Path -LiteralPath $launcherPath) {
  Remove-Item -LiteralPath $launcherPath -Force
  Write-Host "Removed Windows startup launcher:"
  Write-Host $launcherPath
  exit 0
}

Write-Host "No Windows startup launcher was installed."
