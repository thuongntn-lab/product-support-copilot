# macOS server + shared team extension

The Mac server listens on port `8787` and the current team share uses
`http://192.168.10.198:8787` by default. The previous reserved address
`http://192.168.10.2:8787` remains allowed for backward compatibility.
`http://Sadie.local:8787` can be used when the team network resolves the Mac
hostname.

## Enable the shared folder once on the Mac

1. Open **System Settings → General → Sharing**.
2. Turn on **File Sharing**.
3. Add `/Users/Sadie/CustomallExtension` as a shared folder.
4. Set the SMB share name to `CustomallExtension` and grant the team read-only
   access. Enable SMB for the Mac account that owns the folder.
5. Keep the Mac logged in and connected to the same LAN as the team.

The repository is private development only. The team share contains only the
last finalized extension release and is updated by the deployment script.

## Install on each team Mac/PC

1. Connect to `smb://192.168.10.198/CustomallExtension` (or
   `smb://Sadie.local/CustomallExtension`) using the Mac sharing account.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load
   unpacked**.
3. Select the mounted `CustomallExtension` folder.
4. Open the Product Support Copilot side panel → **MVP4 · Lark Data** → **API
   connection settings**.
5. The extension release already contains the internal API URL and key. No
   manual API entry is needed. Do not enter a Lark App Secret.

Team members continue to sign in to Shopify/Customall normally. They do not
need a Lark login; the server's Everlastify Lark identity performs the lookup.

## After a new extension function

The owner updates the private repository, bumps the manifest version, runs the
tests, creates a versioned release, and runs
`/Users/Sadie/product-support-server/deploy-team.zsh <version>`. Team members
then open `chrome://extensions`, click **Reload**, and refresh the Shopify or
Customall page. No reinstall or new Lark login is needed.

Reserve the Mac's LAN address in the router (or use the `.local` hostname) so
the team endpoint does not change unexpectedly.
