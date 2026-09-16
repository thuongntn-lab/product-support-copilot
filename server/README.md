# Lark Live Lookup API

Read-only API used by the Chrome extension to fetch the latest Shipping and GMC
values from the two approved Lark Sheets.

## Security

- Never copy `LARK_APP_SECRET` into the Chrome extension.
- Store all secrets only in the server environment.
- Grant the Lark app read-only Sheet scope.
- Use a long random `LOOKUP_API_KEY`.
- Deploy behind HTTPS before configuring team extensions.

## Setup

1. Copy `.env.example` values into the environment of the server.
2. Grant the Lark app `sheets:spreadsheet:read`.
3. Make both source Sheets accessible to the app.
4. Run `npm test`.
5. Run `npm start`.

The process intentionally does not load `.env` files. Configure environment
variables through the deployment platform or shell.

The default ranges are open-ended (`A:E` and `A:G`), so rows appended to either
source remain visible without changing the server configuration.

Shipping ETA/Page uses `Code` and `Shipping Page` from the exact same Product Type
row when present. If that Product Type is absent, the API returns both fields from
`Others (Sản phẩm đi từ TQ)` and marks the response with `fallbackUsed: true`.
`Code` remains the complete JSON payload, including both the `US` and `Other`
country entries. GMC data never uses this ETA fallback.

For a local prototype on a machine already authenticated with `lark-cli`, set
`LARK_AUTH_MODE=cli-user`. This mode never exposes the user's Lark token and
normally binds to `127.0.0.1`.

For the approved office-LAN setup, `start-shared-lan.ps1` binds the API to
`0.0.0.0:8787`. Windows Firewall must restrict inbound access to the Private
profile and LocalSubnet. The host machine must remain online and authenticated
with `lark-cli`.

To keep the local API available after terminal closure or a process crash, run
`powershell -ExecutionPolicy Bypass -File .\install-keep-alive-task.ps1` once.
This registers the current Windows user to start a background watchdog at logon;
the watchdog restarts the API automatically when port `8787` is unavailable.

The recommended setup is `install-startup-keep-alive.ps1`, which starts the
watchdog inside the interactive Windows session so `lark-cli` can access the
user keychain token. Use it once on the host machine, then restart Windows or
run the shortcut from the Startup folder. The installer also writes a per-user
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry as a second logon
path, because some Windows sessions skip Startup-folder shortcuts.

## Endpoints

- `GET /health`
- `GET /api/lark/product?productType=<Shopify Product Type>&shippingProductType=<ETA Product Type>&gmcProductType=<GMC Product Type>`

The lookup endpoint requires header `X-API-Key`.

For the Windows LAN launcher, set the secret outside the repository before
starting the server, for example:

```powershell
$env:PS_COPILOT_LOOKUP_API_KEY = "<team-api-key>"
& .\start-shared-lan.ps1
```

Never commit the real API key to source control.

`shippingProductType` and `gmcProductType` default to `productType` for backward
compatibility. They are separate because Clothing/Mug/Tumbler use different lookup
keys in the Shipping and Product Category workbooks.
