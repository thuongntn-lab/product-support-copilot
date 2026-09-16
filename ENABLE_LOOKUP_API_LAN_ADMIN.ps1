#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ruleName = "Customall Lookup API - Local subnet"
$existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue

if (-not $existingRule) {
  New-NetFirewallRule `
    -Name $ruleName `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8787 `
    -RemoteAddress LocalSubnet `
    -Profile Private | Out-Null
} else {
  Set-NetFirewallRule `
    -Name $ruleName `
    -Enabled True `
    -Direction Inbound `
    -Action Allow `
    -Profile Private | Out-Null
}
