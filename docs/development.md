# Development and packaging

## Browser

Use Node.js 24+ and FFmpeg/ffprobe on PATH. Run `npm ci && npm start`, then open localhost:4317. Browser mode is intended for a trusted, single-user machine, not a public server. Desktop mode adds a private session cookie.

For an isolated library:

```sh
HARMONIS_DATA_DIR=/tmp/harmonis-dev npm start
```

`SHENGJIAN_DATA_DIR` and `SHENGJIAN_PYTHON` remain compatible aliases. Do not run two processes against the same library. Back up the entire library directory with the app stopped. Restoring a backup replaces its settings as well as projects; protect it as a secret.

## Desktop (macOS)

The current release targets Apple Silicon, macOS 13+. Install Xcode Command Line Tools and Node.js 24+. The media build downloads pinned FFmpeg/LAME source releases and compiles audio-only LGPL executables. It needs make, clang, curl and tar; no Homebrew runtime libraries are linked.

```sh
npm ci
npm run build:media
npm run build:icon
npm run desktop
npm run pack:mac
npm run dist:mac
```

If Electron's install script was disabled by your package-manager policy, run `node node_modules/electron/install.js` first. Installer output is in `dist/`; matching media source is in `release/`. The source archive must accompany redistributed packages. `scripts/media-sources.sha256` pins the downloaded source bytes. Keep `THIRD_PARTY_NOTICES.md` and all bundled license files.

For an isolated desktop test, set both `HARMONIS_PROFILE_DIR` and `HARMONIS_DATA_DIR`. The first normal desktop launch copies the legacy Shengjian library, retaining the original. The desktop profile stores the chosen loopback port for browser-storage continuity.

Current packaging uses ad hoc signing. Developer ID signing and Apple notarization are **not configured**. To publish a notarized release, configure your own developer identity/notary credentials, update the signing configuration, and verify the resulting archive. Never commit credentials. This repository does not include automatic updates.

## Optional Python composer

```sh
python3 -m venv "$HOME/.venvs/harmonis"
"$HOME/.venvs/harmonis/bin/pip" install numpy scipy
HARMONIS_PYTHON="$HOME/.venvs/harmonis/bin/python" npm run desktop
```

For the packaged app, launch its executable with `HARMONIS_PYTHON` set if the interpreter is not discoverable on PATH or the supported standard locations. Built-in scores are under `synth/scores`; see [synth documentation](../synth/README.md). Scores are executable Python: only install code you trust. Custom score management in the installed App is not yet provided.

## Structure

- `desktop/`: Electron lifecycle, isolated preload, library migration and process lock.
- `public/`: browser UI, project drafts, provider-specific parameter views.
- `src/`: loopback API, persisted library, provider adapters, audio conversion and exports.
- `synth/`: optional local Python composition engine.
- `tests/`: isolated service and frontend logic tests; provider responses are controlled fixtures.
- `scripts/`: validation, icon generation and reproducible media-tool build.

The renderer cannot access Node APIs. Narrow IPC provides folder selection, opening the library and draft flushing. API keys are read only by the service. Files are served from the local library, and external links open in the system browser. Provider requests happen only on explicit generation actions; interrupted jobs are marked as unknown rather than automatically replayed.

## Verify and release

```sh
npm run check
npm test
(cd synth && python3 -m unittest -v)
HARMONIS_MEDIA_DIR="$PWD/vendor/darwin-arm64" npm test
npm run audit:public
```

Also launch the packaged app with a clean profile, exercise editing/quit/reopen, native folder selection, and downloading. Real microphone capture and provider billing/quality require separate manual acceptance. Do not substitute fixture responses for live provider checks.

Before publishing, inspect the exact Git tree and packaged resources for keys, recordings, local paths and private screenshots. Keep personal data outside the repository. Publish DMG, ZIP, SHA-256 checksums and the corresponding media-source archive together. CI validates source; it does not notarize or publish packages automatically.

FFmpeg and ffprobe can be replaced in browser mode with `HARMONIS_FFMPEG` and `HARMONIS_FFPROBE`; these variables also override the packaged binaries when launching the executable. This permits using a locally rebuilt LGPL component. Replacement binaries need compatible CLI behavior.
