# Privacy and security

Harmonis is a single-user local tool. Do not expose its HTTP service on a public interface or share the library with untrusted users. The desktop service binds to loopback, authenticates with a private HTTP-only session cookie, blocks cross-site mutations, and keeps Node APIs out of the renderer.

Keys are stored in `settings.json` with file permissions 0600, not encrypted in Keychain. Anyone with access to your user account or backups may read them. Removing a key in the app only removes the local copy; revoke compromised keys at the provider. Never attach settings files, recordings, personal scripts or raw API logs to an issue.

Recording and preview stay local until you explicitly submit a clone. Speech generation sends the script and voice settings to MiniMax China. Music generation sends the prompt or composition plan to ElevenLabs. Providers control retention, billing and media rights. Harmonis does not operate a telemetry backend or silently retry paid calls.

Voice deletion distinguishes local removal from explicit provider deletion. Recordings, projects and generated versions have separate deletion controls. Deleted local media is not recoverable through the app; back up the library if needed.

First-release macOS binaries are ad hoc signed and are not Apple-notarized. No automatic updater is included. Download only from the project's Releases page and compare the published checksum.

Report a vulnerability privately using GitHub's security advisory flow when enabled. If unavailable, open a minimal issue requesting a private contact without posting exploit details, credentials or personal media. Supported release line: 0.1.x.
