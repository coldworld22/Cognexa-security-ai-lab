param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$EnrollmentToken,

  [string]$AgentId = $env:COMPUTERNAME,

  [string]$RemoteAccessJson
)

$computerSystem = Get-CimInstance Win32_ComputerSystem
$systemEnclosure = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
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
$chassisTypes = @($systemEnclosure.ChassisTypes)
$laptopChassisTypes = @(8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32)
$desktopChassisTypes = @(3, 4, 5, 6, 7, 13, 15, 16, 24, 35, 36)
$serverChassisTypes = @(17, 23, 28, 29)
$formFactor =
  if (@($chassisTypes | Where-Object { $laptopChassisTypes -contains $_ }).Count -gt 0) {
    "laptop"
  } elseif (@($chassisTypes | Where-Object { $serverChassisTypes -contains $_ }).Count -gt 0) {
    "server"
  } elseif (@($chassisTypes | Where-Object { $desktopChassisTypes -contains $_ }).Count -gt 0) {
    "desktop"
  } else {
    "unknown"
  }
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
    manufacturer = $computerSystem.Manufacturer
    model = $computerSystem.Model
    chassisTypes = $chassisTypes
    formFactor = $formFactor
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
