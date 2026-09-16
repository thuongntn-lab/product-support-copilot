#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$userName = "CustomallTeam"
$shareName = "CustomallExtension"
$sourcePath = "C:\Users\admin\Documents\Extension Customize\release\Customall-Upload-Copilot-v0.6.4-LAN-Team"
$accountName = "$env:COMPUTERNAME\$userName"
$credentialFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "CustomallTeam-Credentials.txt"
$statusFile = "C:\Users\admin\Documents\Extension Customize\shared-account-setup-status.txt"

try {
  $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%"
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 18
  $random.GetBytes($bytes)
  $passwordPlain = -join ($bytes | ForEach-Object {
    $alphabet[$_ % $alphabet.Length]
  })
  $password = ConvertTo-SecureString $passwordPlain -AsPlainText -Force

  $existingUser = Get-LocalUser -Name $userName -ErrorAction SilentlyContinue
  if ($existingUser) {
    Set-LocalUser `
      -Name $userName `
      -Password $password `
      -AccountNeverExpires `
      -PasswordNeverExpires $true `
      -UserMayChangePassword $false
    Enable-LocalUser -Name $userName
  } else {
    New-LocalUser `
      -Name $userName `
      -Password $password `
      -AccountNeverExpires `
      -PasswordNeverExpires `
      -UserMayNotChangePassword `
      -Description "Read-only Customall extension access" | Out-Null
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

  @"
Shared path: \\192.168.88.4\$shareName
Username: $accountName
Password: $passwordPlain

Run once on each team machine:
net use \\192.168.88.4\$shareName /user:$accountName * /persistent:yes
"@ | Set-Content -LiteralPath $credentialFile -Encoding UTF8

  "SUCCESS`r`nCredential file: $credentialFile" |
    Set-Content -LiteralPath $statusFile -Encoding UTF8
} catch {
  "FAILED`r`n$($_.Exception.Message)" |
    Set-Content -LiteralPath $statusFile -Encoding UTF8
  throw
}
