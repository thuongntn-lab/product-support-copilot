$ErrorActionPreference = "Stop"

$existingListener = Get-NetTCPConnection `
  -LocalPort 8787 `
  -State Listen `
  -ErrorAction SilentlyContinue
if ($existingListener) {
  exit 0
}

$env:PORT = "8787"
$env:HOST = "0.0.0.0"
$env:LARK_AUTH_MODE = "cli-user"
$env:LOOKUP_API_KEY = $env:PS_COPILOT_LOOKUP_API_KEY
$env:LARKSUITE_CLI_NO_UPDATE_NOTIFIER = "1"
$env:LARKSUITE_CLI_NO_SKILLS_NOTIFIER = "1"

Set-Location -LiteralPath $PSScriptRoot
node src/server.js
