# Harmonis · 声间

A local desktop workbench for your voice and music. Clone your own voice with MiniMax, turn scripts into narration, compare takes, and export audio for your video editor. Compose music with ElevenLabs or the optional local Python synthesizer.

**macOS 13+ · Apple Silicon · Bring your own API keys · MIT**

[Download](https://github.com/0mn1si2i5/harmonis/releases) · [中文](README.zh-CN.md) · [使用指南](docs/usage.zh-CN.md) · [Build from source](docs/development.md)

## Install

Download the DMG, open it, and drag **Harmonis** to Applications. The app includes its runtime and audio tools; Node and Homebrew are not required. The interface is currently Chinese.

The first release is **ad hoc signed, not Apple-notarized**. macOS may block an internet-downloaded app. If you trust the release, use the individual **Open Anyway** control in System Settings → Privacy & Security, then confirm opening. Do not disable Gatekeeper globally. Intel and Windows packages are not provided in this release.

## Create

1. Save a MiniMax China pay-as-you-go API key in **服务设置**. Subscription/coding keys are not interchangeable with speech API keys.
2. In **我的音色**, record a clear, natural sample or upload an existing recording. Review it locally before submitting it to MiniMax.
3. Write a script, choose your voice, speed and emotion, and generate. Each result becomes a separate take; replaying a saved take does not generate another request.
4. Select your takes and export WAV/MP3, a ZIP of segments, or a concatenated track. Optional loudness normalization, silence trimming and subtitles help prepare files for an editor.

Music uses a separate ElevenLabs key and account entitlement. Provider parameters remain provider-specific. API usage and output rights are governed by each provider; an app download includes no API credit. Only clone a voice you own or are authorized to use.

## Local by default

Projects, recordings, outputs and keys stay in `~/Library/Application Support/Harmonis/library`. Keys are stored in a mode-0600 settings file, **not an encrypted keychain**. Explicit generation sends the relevant script, recording or music description to the selected provider. Harmonis has no telemetry server or automatic paid retries.

The desktop service binds to loopback and requires a private session cookie. Closing the window keeps the app running; use **⌘Q** to quit. Running tasks trigger a warning, and drafts are saved before shutdown. The first desktop launch copies an existing `Shengjian` library without deleting the original; stop the old browser service first.

See [privacy and security](SECURITY.md), [third-party notices](THIRD_PARTY_NOTICES.md), and [development](docs/development.md). The optional local composer requires Python with NumPy and SciPy; voice and cloud music do not.

## Develop

```sh
npm ci
npm start
```

Browser development requires Node.js 24+, FFmpeg and ffprobe on PATH. Open `http://127.0.0.1:4317`. For desktop builds and source redistribution instructions, see [development](docs/development.md).

```sh
npm run check
npm test
```

Service tests use isolated libraries and controlled provider responses. They do not certify live account billing, provider output quality or real microphone capture. See [release notes](CHANGELOG.md) for the shipped validation scope.

## License

Harmonis source is [MIT](LICENSE). Packaged FFmpeg and LAME retain their LGPL licenses; corresponding source archives accompany releases. Provider subscriptions and generated-media rights are separate from this software license.
