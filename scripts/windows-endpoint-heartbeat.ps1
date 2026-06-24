param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$EnrollmentToken,

  [string]$AgentId = $env:COMPUTERNAME,

  [string]$RemoteAccessJson
)

$computerSystem = Get-CimInstance Win32_ComputerSystem
$operatingSystem = Get-CimInstance Win32_OperatingSystem
$processor = Get-CimInstance Win32_Processor | Select-Object -First 1
$logicalDisk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object -First 1
$defaultRoute = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' |
  Sort-Object RouteMetric, InterfaceMetric |
  Select-Object -First 1

$activeAdapter =
  if ($defaultRoute) {
    Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $defaultRoute.InterfaceIndex |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
      } |
      Select-Object -First 1
  } else {
    $null
  }

if (-not $activeAdapter) {
  $activeAdapter = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.InterfaceAlias -notmatch 'vEthernet|WSL|Host-Only|VirtualBox|VMware|Bluetooth'
    } |
    Sort-Object SkipAsSource |
    Select-Object -First 1
}

if (-not $activeAdapter) {
  throw "No active IPv4 adapter was found."
}

$adapter = Get-NetAdapter | Where-Object { $_.ifIndex -eq $activeAdapter.InterfaceIndex } | Select-Object -First 1
$totalMemoryBytes = [double]$computerSystem.TotalPhysicalMemory
$freeMemoryKb = [double]$operatingSystem.FreePhysicalMemory
$usedMemoryPercent =
  if ($totalMemoryBytes -gt 0) {
    [math]::Round((($totalMemoryBytes - ($freeMemoryKb * 1KB)) / $totalMemoryBytes) * 100, 2)
  } else {
    $null
  }

$diskUsagePercent =
  if ($logicalDisk -and [double]$logicalDisk.Size -gt 0) {
    [math]::Round(((($logicalDisk.Size - $logicalDisk.FreeSpace) / $logicalDisk.Size) * 100), 2)
  } else {
    $null
  }

$telemetry = @{
  activeAlerts = 0
}

if ($usedMemoryPercent -ne $null) {
  $telemetry.memoryUsagePercent = $usedMemoryPercent
}

if ($diskUsagePercent -ne $null) {
  $telemetry.diskUsagePercent = $diskUsagePercent
}

$payload = @{
  agentId = $AgentId
  displayName = $env:COMPUTERNAME
  hostname = $env:COMPUTERNAME
  ipAddress = $activeAdapter.IPAddress
  macAddress = if ($adapter) { $adapter.MacAddress } else { $null }
  subnet = "$($activeAdapter.IPAddress)/$($activeAdapter.PrefixLength)"
  operatingSystem = $operatingSystem.Caption
  loggedInUser = $computerSystem.UserName
  telemetry = $telemetry
  metadata = @{
    source = "windows-heartbeat-script"
    interfaceAlias = $activeAdapter.InterfaceAlias
    interfaceIndex = $activeAdapter.InterfaceIndex
    adapterDescription = if ($adapter) { $adapter.InterfaceDescription } else { $null }
    processor = if ($processor) { $processor.Name } else { $null }
  }
}

if ($RemoteAccessJson) {
  try {
    $remoteAccess = $RemoteAccessJson | ConvertFrom-Json -AsHashtable
    if ($remoteAccess -and $remoteAccess.launchUrl) {
      $payload.metadata.remoteAccess = $remoteAccess
    }
  } catch {
    Write-Warning "RemoteAccessJson could not be parsed. Skipping remote access metadata."
  }
}

Invoke-RestMethod `
  -Method Post `
  -Uri "$($ApiBaseUrl.TrimEnd('/'))/endpoint-agents/check-in" `
  -Headers @{
    "Content-Type" = "application/json"
    "x-endpoint-enrollment-token" = $EnrollmentToken
  } `
  -Body ($payload | ConvertTo-Json -Depth 6)
