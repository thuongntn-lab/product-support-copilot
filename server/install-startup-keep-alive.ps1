$ErrorActionPreference = "Stop"

$serverRoot = $PSScriptRoot
$monitor = Join-Path $serverRoot "keep-alive-shared-lan.ps1"
$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startup "Customall Lookup API.lnk"

New-Item -ItemType Directory -Path $startup -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$monitor`""
$shortcut.WorkingDirectory = $serverRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Keeps the local Customall Lookup API available in the interactive Windows session."
$shortcut.Save()

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$powershell = Join-Path $PSHOME "powershell.exe"
$runCommand = "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$monitor`""
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name "Customall Lookup API" -Value $runCommand -PropertyType String -Force | Out-Null

Write-Output "Installed startup watchdog: $shortcutPath"
