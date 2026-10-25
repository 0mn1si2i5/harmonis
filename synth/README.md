# synth：Python 编曲引擎

Harmonis「编曲」页调用的本机合成引擎，依赖 numpy 和 scipy。在本目录运行：

```sh
python3 -m engine.render scores/trailer1_fast.py --out /tmp/trailer1.wav
python3 -m engine.render scores/template_150.py --plucks scores/plucks_example.csv --out /tmp/template.wav --peaks /tmp/template.peaks.json
python3 -m engine.render scores/template_150.py --loop --bars 6 --out /tmp/loop6.wav --stems /tmp/loop6-stems
python3 -m unittest -v
```

参数：`--loop` / `--no-loop` 覆盖曲谱的循环设置，`--bars` 覆盖小节数，`--seed` 覆盖随机种子，`--plucks` 读拨弦数据，`--peaks` 写波形 JSON，`--stems` 写分轨。stdout 最后一行是 JSON 摘要（文件、时长、峰值、是否循环），循环时前一行是接缝数值；出错写 stderr，返回非零。

## 曲谱

曲谱是 `scores/` 下的 .py，导出 `SONG` 配置字典和 `arrange(song, plucks)`。模块文档字符串第一行是Harmonis页面上显示的名字。

- `SONG` 的键对应 `Song` 的参数：`bpm`、`bars`、`beats_per_bar`、`pickup_beats`（弱起拍数）、`tail`（尾音秒数，默认 4）、`loop`、`sample_rate`（默认 48000）、`seed`。
- `plucks` 已换算成 `(秒, MIDI, 力度)`，音色和时值由曲谱决定。
- 用 `Instruments(song)` 取音色，`song.bus('名字').add(信号, 秒, 增益, 声像)` 往总线上加声音。立体声数组形状为 `(2, 采样数)`，单声道按声像分到两边。
- `song.T(小节, 拍)` 已包含弱起偏移；弱起本身从 0 秒开始编排。

现有曲谱：

- `template_150.py`：150 BPM 新曲模板，和弦 Dm9 G13 Cmaj9 Am9 Fmaj9 Em9 Dm9 G13，动机 A G E D E G，两拍弱起。
- `trailer1_fast.py`：150 BPM、23 小节的宣传片编曲示例。

## 拨弦数据

CSV 每行 `小节,拍,牌数`，表头可写中文或英文，`#` 开头是注释。默认以第一步的牌数为起点，起音 D4（MIDI 62）：多一张升一级 C 大调五声音阶，少一张降一级，超过 MIDI 96 按八度折回。JSON 可以写多段，各自指定起点：

```json
{
  "segments": [
    {
      "base_cards": 4,
      "base_note": 62,
      "fold_above": 96,
      "gain": 0.8,
      "steps": [
        { "bar": 2, "beat": 0, "cards": 4 },
        { "bar": 2, "beat": 0.5, "cards": 6 }
      ]
    }
  ]
}
```

起音必须是 C、D、E、G、A 之一。没有拨弦数据时模板的拨弦总线静音。

## 循环

`--loop` 把弱起改成 0；直接构造 `Song(loop=True, pickup_beats=2)` 会报错。循环模式要求每拍采样数是整数（150 BPM 在 44.1 kHz 和 48 kHz 下都是）。混响、延迟、高通做完以后，把超出循环长度的尾音逐段加回开头，再做饱和和统一增益，所以首尾能无缝相接。尾音截在 `tail` 秒，特别长的持续音要调大 `tail`。

## 输出

- 母带：28 Hz 高通、tanh 饱和，峰值归一到 -1 dBFS；非循环时最后一小节之后淡出。
- 分轨：各总线和 `effects` 效果轨，取侧链之后、母带处理之前的信号，分轨相加不等于最终 WAV。
- 波形 JSON：最终音频每 10 毫秒的双声道最大绝对值，另带 `sampleRate`、`duration`、`bpm`、`beatsPerBar`、`pickupBeats`、`bars`、`loop`。

## 文件

- `engine/dsp.py`：滤波、振荡器、包络、噪声和效果。
- `engine/instruments.py`：全部音色，拨弦用 Karplus–Strong。
- `engine/harmony.py`：和弦表、和弦计划、动机和五声音阶走级。
- `engine/plucks.py`：拨弦 CSV/JSON 解析和牌数到音高的换算。
- `engine/song.py`：时间轴、总线、随机源和循环折叠。
- `engine/mix.py`：默认混音和分轨。
- `engine/render.py`：命令行入口、WAV 和波形输出。
- `tests/test_engine.py`：映射、解析、时间轴、命令行和循环接缝测试。
