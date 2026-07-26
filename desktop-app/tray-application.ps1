[CmdletBinding()]
param(
  [string]$ApiBaseUrl = $(if ($env:SECURITY_AI_LAB_API_URL) {
      $env:SECURITY_AI_LAB_API_URL
    } else {
      "http://localhost:5000/api/v1"
    }),
  [string]$AccessToken = $env:SECURITY_AI_LAB_ACCESS_TOKEN,
  [string]$FrontendUrl = $(if ($env:SECURITY_AI_LAB_FRONTEND_URL) {
      $env:SECURITY_AI_LAB_FRONTEND_URL
    } else {
      "http://localhost:3000"
    }),
  [int]$SocksPort = 9050,
  [int]$ControlPort = 9051,
  [int]$DnsPort = 9053
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$protectionScript = Join-Path $repoRoot "scripts\protect-pc.ps1"

if (-not (Test-Path -LiteralPath $protectionScript)) {
  throw "Protection script not found at $protectionScript"
}

function Show-Balloon {
  param(
    [string]$Title,
    [string]$Message,
    [System.Windows.Forms.ToolTipIcon]$Icon = [System.Windows.Forms.ToolTipIcon]::Info
  )

  $notifyIcon.BalloonTipTitle = $Title
  $notifyIcon.BalloonTipText = $Message
  $notifyIcon.BalloonTipIcon = $Icon
  $notifyIcon.ShowBalloonTip(4000)
}

function Invoke-ProtectionAction {
  param(
    [ValidateSet("Activate", "Deactivate", "Status")]
    [string]$Action
  )

  try {
    $parameters = @{
      Action = $Action
      ApiBaseUrl = $ApiBaseUrl
      SocksPort = $SocksPort
      ControlPort = $ControlPort
      DnsPort = $DnsPort
    }

    if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
      $parameters.AccessToken = $AccessToken
    }

    $output = & $protectionScript @parameters 2>&1 | Out-String
    $lines = $output.Trim() -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }
    $message = if ($lines.Count -gt 0) {
      $lines[-1]
    } else {
      "$Action completed."
    }

    Show-Balloon -Title "Protection $Action" -Message $message
  } catch {
    Show-Balloon `
      -Title "Protection $Action failed" `
      -Message $_.Exception.Message `
      -Icon ([System.Windows.Forms.ToolTipIcon]::Error)
  }
}

function Open-Url {
  param([string]$Url)
  [System.Diagnostics.Process]::Start($Url) | Out-Null
}

function Get-HealthUrl {
  $baseUrl = $ApiBaseUrl.TrimEnd("/")
  if ($baseUrl -match "/api/[^/]+$") {
    return ($baseUrl -replace "/api/[^/]+$", "/health")
  }

  return "$baseUrl/health"
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
$notifyIcon.Text = "Security AI Lab Protection"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$activateItem = $contextMenu.Items.Add("Activate protection")
$activateItem.Add_Click({ Invoke-ProtectionAction -Action "Activate" })

$deactivateItem = $contextMenu.Items.Add("Deactivate protection")
$deactivateItem.Add_Click({ Invoke-ProtectionAction -Action "Deactivate" })

$statusItem = $contextMenu.Items.Add("Check status")
$statusItem.Add_Click({ Invoke-ProtectionAction -Action "Status" })

[void]$contextMenu.Items.Add("-")

$privateModeItem = $contextMenu.Items.Add("Open Private Mode Console")
$privateModeItem.Add_Click({
    Open-Url -Url "$($FrontendUrl.TrimEnd('/'))/admin/private-mode"
  })

$healthItem = $contextMenu.Items.Add("Open Backend Health")
$healthItem.Add_Click({
    Open-Url -Url (Get-HealthUrl)
  })

[void]$contextMenu.Items.Add("-")

$applicationContext = New-Object System.Windows.Forms.ApplicationContext
$quitItem = $contextMenu.Items.Add("Quit")
$quitItem.Add_Click({
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    $applicationContext.ExitThread()
  })

$notifyIcon.ContextMenuStrip = $contextMenu
Show-Balloon -Title "Security AI Lab" -Message "Protection tray ready."
[System.Windows.Forms.Application]::Run($applicationContext)
