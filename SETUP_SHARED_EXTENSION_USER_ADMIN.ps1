#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$userName = "CustomallTeam"
$shareName = "CustomallExtension"
$sourcePath = "C:\Users\admin\Documents\Extension Customize\release\Customall-Upload-Copilot-v0.6.4-LAN-Team"
$accountName = "$env:COMPUTERNAME\$userName"

Write-Host "Create or update the read-only LAN account: $accountName"
$password = Read-Host "Enter a password to share with the team" -AsSecureString
if (-not $password.Length) {
  throw "Password cannot be empty."
}

$existingUser = Get-LocalUser -Name $userName -ErrorAction SilentlyContinue
if ($existingUser) {
  Set-LocalUser `
    -Name $userName `
    -Password $password `
    -AccountNeverExpires `
    -PasswordNeverExpires $true
  Enable-LocalUser -Name $userName
} else {
  New-LocalUser `
    -Name $userName `
    -Password $password `
    -AccountNeverExpires `
    -PasswordNeverExpires `
    -UserMayNotChangePassword `
    -Description "Read-only access to the Customall extension share" | Out-Null
}

Grant-SmbShareAccess `
  -Name $shareName `
  -AccountName $accountName `
  -AccessRight Read `
  -Force | Out-Null

Revoke-SmbShareAccess `
  -Name $shareName `
  -AccountName "Everyone" `
  -Force `
  -ErrorAction SilentlyContinue | Out-Null

& icacls.exe $sourcePath /grant "${accountName}:(OI)(CI)(RX)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not grant NTFS read access to $accountName."
}

Write-Host ""
Write-Host "Read-only team account is ready." -ForegroundColor Green
Write-Host "Username: $accountName" -ForegroundColor Cyan
Write-Host "Share: \\192.168.88.4\$shareName" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run this once on each team machine:"
Write-Host "net use \\192.168.88.4\$shareName /user:$accountName * /persistent:yes" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to close"
