# Project deployment rule

For every Product Support Copilot code or logic change:

- Preserve previously approved MVP behavior unless the user explicitly
  approves a change.
- Run the relevant syntax and logic tests.
- Create a versioned folder under `release`.
- Always deploy the changed extension files to the local source path of the
  `CustomallExtension` SMB share. Resolve the current path with
  `Get-SmbShare -Name CustomallExtension`; do not assume a drive-letter mapping.
- Verify that the workspace, versioned release, and shared deployment have the
  same manifest version and SHA-256 hashes for every changed runtime file.
- A change is not complete until team members can receive it with Chrome
  **Reload** followed by a refresh of the working page.
- Whenever a user-visible function is added or changed, update
  `PS-Copilot-Training.html` in the workspace and copy the same file to the
  resolved `CustomallExtension` share. Keep this training document responsive,
  offline-capable, and read-only (no completion/progress tracking).

Do not leave a fix only in the workspace or only in a versioned release.
