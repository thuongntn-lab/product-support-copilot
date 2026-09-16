$ErrorActionPreference = "SilentlyContinue"

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = Join-Path ${env:ProgramFiles} "nodejs\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodePath = "node"
}

$env:PORT = "8787"
$env:HOST = "0.0.0.0"
$env:LARK_AUTH_MODE = "cli-user"
$env:LOOKUP_API_KEY = $env:PS_COPILOT_LOOKUP_API_KEY
$env:LARKSUITE_CLI_NO_UPDATE_NOTIFIER = "1"
$env:LARKSUITE_CLI_NO_SKILLS_NOTIFIER = "1"
$env:USERPROFILE = "C:\Users\admin"
$env:APPDATA = "C:\Users\admin\AppData\Roaming"
$env:LOCALAPPDATA = "C:\Users\admin\AppData\Local"
$env:LARK_CLI_ENTRY = "C:\Users\admin\AppData\Roaming\npm\node_modules\@larksuite\cli\scripts\run.js"

while ($true) {
  $listener = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) {
    Push-Location -LiteralPath $serverRoot
    try {
      & $nodePath src/server.js
    } finally {
      Pop-Location
    }
    Start-Sleep -Seconds 2
  } else {
    Start-Sleep -Seconds 15
  }
}
