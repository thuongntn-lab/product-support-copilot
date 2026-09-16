# Shared extension folder

## One-time setup on the owner machine

1. Right-click `SETUP_SHARED_EXTENSION_ADMIN.ps1`.
2. Choose **Run with PowerShell** as Administrator.
3. Confirm the Windows UAC prompt.
4. Keep this machine connected to the same LAN as the team.

The shared path is:

`\\192.168.88.4\CustomallExtension`

Team members receive read-only access. The owner machine remains the only
machine that edits the extension source.

## One-time setup on each team machine

1. Press `Win + R`.
2. Open `\\192.168.88.4\CustomallExtension`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Remove the old local copy of Product Support Copilot.
6. Click **Load unpacked** and select the shared folder.

## After future code changes

The owner updates the shared folder. Team members only need to open
`chrome://extensions`, click **Reload**, then refresh the working page.

### Mandatory release rule

A code change is not complete until all of the following are true:

1. The change passes syntax and logic tests in the workspace.
2. A versioned release folder is created under `release`.
3. The changed extension files are copied to the source folder of the
   `CustomallExtension` SMB share.
4. `manifest.json`, `src/background.js`, and the changed content/UI files have
   matching versions and SHA-256 hashes in the workspace, versioned release,
   and shared folder.
5. The SMB share is verified to point to that shared folder.

Never mark a fix as delivered if it exists only in the workspace or only in a
versioned release folder. The team-loaded shared folder is the deployment
target.

The owner machine and LAN connection must be available when Chrome loads or
reloads the extension.
