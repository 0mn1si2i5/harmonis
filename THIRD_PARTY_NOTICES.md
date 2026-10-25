# Third-party software

Harmonis application code is MIT licensed. Third-party projects retain their
copyrights and licenses. No API service, model, voice, or music license is granted
by the Harmonis license.

## Electron

The desktop application bundles Electron under MIT and Chromium/Node.js and their
components under their respective licenses. Full Electron license files are shipped
inside the application bundle (`LICENSE.electron.txt` / `LICENSES.chromium.html`).
Source: https://github.com/electron/electron

## FFmpeg 9.0.2 and LAME 3.100

This software uses tools from the FFmpeg project under LGPL 2.1 or later, and LAME
under LGPL 2 or later. They run as separate executables, not as libraries linked
into Harmonis. The audio-only FFmpeg build disables GPL and nonfree components.
LAME is statically linked into the FFmpeg executable. No FFmpeg or LAME source
modifications are made. Both programs can be rebuilt using the distributed source
archives and build script. You may replace the executables in the application
bundle, or use HARMONIS_FFMPEG and HARMONIS_FFPROBE to point to replacements.
There is no restriction on reverse engineering or modification of these components.

Full license texts and the actual configure flags are included in
`Harmonis.app/Contents/Resources/media/`. Exact corresponding source archives,
checksums, and build instructions are distributed beside each binary release:
https://github.com/0mn1si2i5/harmonis/releases

Upstream: https://ffmpeg.org/ and https://lame.sourceforge.io/
Build script: scripts/build-media.sh. Source checksums: scripts/media-sources.sha256.

## JavaScript dependencies

Express (MIT), Multer (MIT), Archiver (MIT), and json-bigint (MIT), together with
their transitive dependencies, are installed according to package-lock.json.
Their license files remain in the packaged node_modules. See package-lock.json
for exact versions. Development-only tooling is not shipped in the app.

## Optional Python synthesis

Python, NumPy and SciPy are not bundled. Users install them separately if they want
local composition. Python uses the PSF license, NumPy and SciPy use BSD licenses.
The synth/ engine in this repository is part of Harmonis under MIT.

## Provider accounts

MiniMax and ElevenLabs are external services. Users bring their own API keys and
are responsible for account fees, provider terms, and rights to input voices,
scripts and generated media. Harmonis does not include provider credits or models.
