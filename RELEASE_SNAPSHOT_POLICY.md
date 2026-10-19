# Local release snapshots

Every approved Product Support Copilot version must be copied to `release/<version>/`
before deployment. The snapshot includes the manifest, runtime source, bridge files,
side panel, assets, and training document. The deployed `CustomallExtension` copy must
use the same manifest version and the same SHA-256 values for runtime files.

Restore a version by copying the matching snapshot back to the workspace and then
syncing the workspace to the local `CustomallExtension` share. Never label a build with
a version whose snapshot does not exist locally.
