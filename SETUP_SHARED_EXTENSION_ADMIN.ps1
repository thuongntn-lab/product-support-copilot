#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$shareName = "CustomallExtension"
$sourcePath = "C:\Users\admin\Documents\Extension Customize\release\Customall-Upload-Copilot-v0.6.4-LAN-Team"
$interfaceAlias = "Ethernet"
$firewallRuleName = "Customall Extension SMB - Local subnet"

if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
  throw "Extension folder not found: $sourcePath"
}

$resolvedSource = (Resolve-Path -LiteralPath $sourcePath).Path
$existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
if ($existingShare -and $existingShare.Path -ne $resolvedSource) {
  throw "Share '$shareName' already points to another folder: $($existingShare.Path)"
}

if (-not $existingShare) {
  New-SmbShare `
    -Name $shareName `
    -Path $resolvedSource `
    -Description "Product Support Copilot shared extension source" `
    -ReadAccess "Everyone" `
    -FolderEnumerationMode AccessBased | Out-Null
}

# Share permission is read-only. NTFS also needs read/execute permission.
& icacls.exe $resolvedSource /grant "*S-1-1-0:(OI)(CI)(RX)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not grant read-only NTFS access to the shared extension folder."
}

$profile = Get-NetConnectionProfile -InterfaceAlias $interfaceAlias -ErrorAction Stop
if ($profile.NetworkCategory -ne "Private") {
  Set-NetConnectionProfile `
    -InterfaceAlias $interfaceAlias `
    -NetworkCategory Private
}

$existingFirewallRule = Get-NetFirewallRule `
  -Name $firewallRuleName `
  -ErrorAction SilentlyContinue
if (-not $existingFirewallRule) {
  New-NetFirewallRule `
    -Name $firewallRuleName `
    -DisplayName $firewallRuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 445 `
    -RemoteAddress LocalSubnet `
    -Profile Private | Out-Null
} else {
  Set-NetFirewallRule `
    -Name $firewallRuleName `
    -Enabled True `
    -Direction Inbound `
    -Action Allow `
    -Profile Private | Out-Null
}

$ipAddress = Get-NetIPAddress `
  -InterfaceAlias $interfaceAlias `
  -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*"
  } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "Shared extension is ready." -ForegroundColor Green
Write-Host "Team path: \\$ipAddress\$shareName" -ForegroundColor Cyan
Write-Host "Permission: read-only for team."
Write-Host ""
Read-Host "Press Enter to close"
