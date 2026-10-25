# Harmonis · 声间

本机声音工作台：用 MiniMax 克隆自己的音色并生成配音，用 ElevenLabs 创作音乐，再下载到剪辑软件。保留每次生成的版本，支持分段参数、试听比较、字幕和音频整理。

[下载安装包](https://github.com/0mn1si2i5/harmonis/releases) · [详细使用指南](docs/usage.zh-CN.md) · [源码构建](docs/development.md)

## 安装和使用

适用于 **macOS 13 及以上、Apple Silicon**。打开 DMG，把 Harmonis 拖进「应用程序」。安装包带有运行环境和音频工具，不需要安装 Node 或 Homebrew。

首版是 **ad hoc 签名，尚未经过 Apple 公证**。从网上下载后可能被 macOS 拦截；核实来源后，可在「系统设置 → 隐私与安全性」对这个 App 选择「仍要打开」，不要全局关闭 Gatekeeper。暂不提供 Intel / Windows 安装包。

1. 在「服务设置」填入 MiniMax 中国站按量 API Key；音乐另填 ElevenLabs Key。
2. 「我的音色」直接录音或上传，先试听，再明确提交到 MiniMax 克隆。
3. 写文案，选择音色、语速和情绪，生成后比较各版。
4. 选定版本，导出 WAV / MP3、分段 ZIP 或合并音频，可附字幕、统一响度和去掉首尾静音。

下载 App 不包含 API 额度。供应商独立计费，音色和音乐使用权以其账户规则为准。仅克隆自己或已获授权的声音。

## 数据与旧版迁移

数据保存在 `~/Library/Application Support/Harmonis/library`；密钥在同目录权限为 0600 的 settings.json 中，**没有使用加密钥匙串**。App 不提供遥测服务。只有明确生成或提交克隆时，相关内容才发给供应商。

首次打开会复制旧的 `~/Library/Application Support/Shengjian` 资料库，原目录保留。迁移前先停止旧网页服务。请勿同时编辑两份资料库。退出前自动保存草稿，有运行中任务时会提示。关闭窗口会留在后台，完全退出用 ⌘Q。

「编曲」是可选的本机 Python 功能，需要 NumPy、SciPy；配音和云端音乐不依赖 Python。参见 [开发说明](docs/development.md)、[隐私说明](SECURITY.md) 和 [第三方许可证](THIRD_PARTY_NOTICES.md)。

源码使用 MIT 许可证，FFmpeg / LAME 保留各自 LGPL 许可证；生成内容的授权不由 MIT 许可证决定。
