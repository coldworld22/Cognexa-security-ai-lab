$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logsDir = Join-Path $repoRoot "logs"
$certFiles = @(
  (Join-Path $repoRoot "certs\localhost.pem"),
  (Join-Path $repoRoot "certs\localhost-key.pem"),
  (Join-Path $repoRoot "certs\localhost-ca.pem")
)

function Test-PortListening {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  try {
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -First 1
  } catch {
    return $null
  }
}

function Wait-ForPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-PortListening -Port $Port) {
      return
    }

    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for port $Port to start listening."
}

function Wait-ForDockerHealth {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ContainerName,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $status = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $ContainerName 2>$null
    if ($LASTEXITCODE -eq 0 -and ($status -eq "healthy" -or $status -eq "running")) {
      return
    }

    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for container '$ContainerName' to become healthy."
}

function Wait-ForHttpsStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [Parameter(Mandatory = $true)]
    [string[]]$AllowedStatusCodes,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $statusCode = & curl.exe -k -s -o NUL -w "%{http_code}" $Url
    if ($LASTEXITCODE -eq 0 -and $AllowedStatusCodes -contains $statusCode) {
      return $statusCode
    }

    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Url to return one of: $($AllowedStatusCodes -join ', ')."
}

function Start-ComposeService {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Services,
    [int]$Attempts = 20,
    [int]$DelaySeconds = 6
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    & docker compose up -d @Services
    if ($LASTEXITCODE -eq 0) {
      return
    }

    if ($attempt -ge $Attempts) {
      throw "Failed to start Docker services '$($Services -join ", ")' after $Attempts attempts."
    }

    Write-Host "Docker is not ready yet. Retrying in $DelaySeconds seconds ($attempt/$Attempts)..."
    Start-Sleep -Seconds $DelaySeconds
  }
}

function Start-RepoProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutPath = Join-Path $logsDir "$Name-$timestamp.out.log"
  $stderrPath = Join-Path $logsDir "$Name-$timestamp.err.log"

  $process = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList $Arguments `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  return [pscustomobject]@{
    Process = $process
    Stdout = $stdoutPath
    Stderr = $stderrPath
  }
}

Set-Location $repoRoot

if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$missingCerts = $certFiles | Where-Object { -not (Test-Path $_) }
if ($missingCerts.Count -gt 0) {
  Write-Host "Generating local HTTPS certificates..."
  & npm.cmd run certs:dev
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to generate local HTTPS certificates."
  }
}

Write-Host "Starting PostgreSQL container..."
Start-ComposeService -Services @("postgres")

Wait-ForDockerHealth -ContainerName "security-ai-lab-postgres"
Wait-ForPort -Port 5433

$backendLog = $null
if (-not (Test-PortListening -Port 5000)) {
  Write-Host "Starting backend..."
  $backendLog = Start-RepoProcess -Name "backend-dev" -Arguments @("run", "dev:backend")
}

Wait-ForHttpsStatus -Url "https://localhost:5000/health" -AllowedStatusCodes @("200") | Out-Null

$frontendLog = $null
if (-not (Test-PortListening -Port 3000)) {
  Write-Host "Starting frontend..."
  $frontendLog = Start-RepoProcess -Name "frontend-dev" -Arguments @("run", "dev:frontend")
}

Wait-ForHttpsStatus -Url "https://localhost:3000/login" -AllowedStatusCodes @("200", "307", "308") | Out-Null

Write-Host ""
Write-Host "App is running."
Write-Host "Frontend: https://localhost:3000"
Write-Host "Backend health: https://localhost:5000/health"

if ($backendLog) {
  Write-Host "Backend logs: $($backendLog.Stdout)"
  Write-Host "Backend errors: $($backendLog.Stderr)"
}

if ($frontendLog) {
  Write-Host "Frontend logs: $($frontendLog.Stdout)"
  Write-Host "Frontend errors: $($frontendLog.Stderr)"
}
