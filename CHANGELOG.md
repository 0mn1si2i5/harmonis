# Changelog

## 0.1.1 — 2026-10-25

Include the public-release audit script in clean checkouts. Narrow the release-output ignore rule so it does not hide source tooling. Desktop functionality is unchanged.

## 0.1.0 — 2026-10-25

First public release as **Harmonis · 声间**.

- macOS desktop app with bundled runtime, FFmpeg and ffprobe; native folder selection and downloads.
- MiniMax voice cloning, recording/upload, script narration, per-segment settings and saved takes.
- ElevenLabs music and an optional local Python composer.
- WAV/MP3, ZIP, concatenated audio and subtitle exports with optional audio processing.
- Voice, recording, project, version and task cleanup; provider console links.
- Local library migration from Shengjian, single-writer protection, draft saving on quit and active-task warnings.

Validation includes isolated service tests using the bundled audio tools and desktop UI smoke checks. These tests do not certify real microphone quality, provider billing or generation quality. The first package supports Apple Silicon and macOS 13+; it is ad hoc signed, not Apple-notarized. Python is optional and not bundled.
