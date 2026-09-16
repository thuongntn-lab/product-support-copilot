# Deploy the shared Lookup API on Render

This deployment keeps Lark credentials on the server. Never put
`LARK_APP_SECRET` in the Chrome extension or commit it to Git.

## Required Lark app

Create an internal Lark app for the workspace and grant it read-only Sheets
access (`sheets:spreadsheet:read`). Give the app access to both approved source
workbooks.

## Render deployment

1. Push this project to a private Git repository.
2. In Render, create a Blueprint and select that repository.
3. Render reads `render.yaml` from the repository root.
4. Enter these secret environment variables in Render:
   - `LARK_APP_ID`
   - `LARK_APP_SECRET`
   - `LOOKUP_API_KEY` (use a long random value)
5. Deploy and verify `https://<service-host>/health` returns:
   `{"ok":true,"service":"customall-lark-lookup"}`.
6. In the extension, enter the Render origin as **Lookup API URL** and the same
   `LOOKUP_API_KEY`, then use **Save & test connection**.

All team members use the same HTTPS origin. The API key is stored locally by
Chrome on each machine.
