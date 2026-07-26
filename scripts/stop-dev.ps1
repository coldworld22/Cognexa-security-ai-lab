$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Stop-PortProcess {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $connections = @()
  try {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  } catch {
    $connections = @()
  }

  $processIds = $connections |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped process $processId on port $Port."
    } catch {
      Write-Warning ("Failed to stop process {0} on port {1}: {2}" -f $processId, $Port, $_.Exception.Message)
    }
  }
}

Set-Location $repoRoot

Stop-PortProcess -Port 3000
Stop-PortProcess -Port 5000

Write-Host "Stopping PostgreSQL container..."
& docker compose stop postgres
if ($LASTEXITCODE -ne 0) {
  throw "Failed to stop the PostgreSQL container."
}

Write-Host "App services stopped."
