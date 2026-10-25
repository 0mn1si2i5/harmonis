import { mediaExecutable } from './paths.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { run, probe } from './audio.js';
const execBuffer = (cmd, args) =>
  promisify(execFile)(mediaExecutable(cmd), args, {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120000,
  });

// 本机音频检查与成品处理，全部用 ffmpeg 的滤镜，日志从 stderr 里读。
const stats = args => run('ffmpeg', ['-nostats', '-v', 'info', ...args, '-f', 'null', '-']);
const num = (text, re) => {
  const m = text.match(re);
  if (!m) return null;
  return /inf/i.test(m[1]) ? -Infinity : Number(m[1]);
};

// 录音检查：峰值、平均电平、底噪（0.5 秒窗口里最安静的一段）、整段响度
export async function analyze(file) {
  const { stderr } = await stats([
    '-i',
    file,
    '-af',
    'astats=length=0.5:measure_perchannel=none:measure_overall=Peak_level+RMS_level+RMS_trough,ebur128=framelog=quiet',
  ]);
  const round = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v === -Infinity ? null : v);
  return {
    peakDb: round(num(stderr, /Peak level dB:\s*(-?[\d.]+|-?inf)/i)),
    rmsDb: round(num(stderr, /RMS level dB:\s*(-?[\d.]+|-?inf)/i)),
    // ffmpeg 把 trough 拼成了 through
    noiseFloorDb: round(num(stderr, /RMS (?:trough|through) dB:\s*(-?[\d.]+|-?inf)/i)),
    lufs: round(num(stderr, /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)/)),
  };
}

// 首尾静音的位置。返回有声部分的起止秒数。
export async function detectEdges(file, thresholdDb = -50) {
  const { duration } = await probe(file);
  const { stderr } = await stats(['-i', file, '-af', `silencedetect=noise=${thresholdDb}dB:d=0.05`]);
  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map(m => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => Number(m[1]));
  let start = 0,
    end = duration;
  if (starts.length && starts[0] <= 0.01 && ends.length) start = ends[0];
  const last = starts.at(-1);
  // 最后一段静音一直持续到文件结尾：没有对应的 silence_end，或者 silence_end 就是结尾
  if (last !== undefined && last > start && (ends.length < starts.length || ends.at(-1) >= duration - 0.02))
    end = last;
  if (end <= start) return { start: 0, end: duration, duration };
  return { start, end, duration };
}

/**
 * 旁白成品：去首尾静音（各留 pad 秒）、响度统一（两遍 loudnorm，线性增益）、转采样率。
 * 返回 offset：成品第 0 秒对应原音频的第几秒，字幕要据此平移。
 */
export async function processVoice(
  source,
  dest,
  { trim = true, loudness = true, sampleRate = 48000, format = 'wav', pad = 0.1, target = -16 } = {}
) {
  let offset = 0,
    filters = [];
  const info = await probe(source);
  let length = info.duration;
  if (trim) {
    const edges = await detectEdges(source);
    offset = Math.max(0, edges.start - pad);
    const end = Math.min(edges.duration, edges.end + pad);
    length = end - offset;
    filters.push(`atrim=start=${offset.toFixed(4)}:end=${end.toFixed(4)}`, 'asetpts=PTS-STARTPTS');
  }
  if (loudness) {
    const ln = `loudnorm=I=${target}:TP=-1:LRA=11`;
    const { stderr } = await stats(['-i', source, '-af', [...filters, `${ln}:print_format=json`].join(',')]);
    const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
    const m = JSON.parse(json);
    filters.push(
      `${ln}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
    );
  }
  const codec = format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'pcm_s16le'];
  await run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    source,
    ...(filters.length ? ['-af', filters.join(',')] : []),
    '-ar',
    String(sampleRate),
    ...codec,
    dest,
  ]);
  return { offset, duration: length };
}

const stamp = ms => {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000),
    m = Math.floor(t / 60000) % 60,
    s = Math.floor(t / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(t % 1000).padStart(3, '0')}`;
};

// 句级字幕 → SRT。shift 是秒：成品相对原音频的平移（减去去掉的开头，加上前面段落的总长）。
export function toSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.begin)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}
export function shiftCues(subtitles, shiftSeconds, limitSeconds = Infinity) {
  return (subtitles || [])
    .map(c => ({
      text: c.text.replace(/<#[\d.]+#>/g, ''),
      begin: c.begin + shiftSeconds * 1000,
      end: Math.min(c.end + shiftSeconds * 1000, limitSeconds * 1000),
    }))
    .filter(c => c.end > 0 && c.end > c.begin);
}

// 波形：每个桶取绝对值最大的样本，0–1。用 4 kHz 单声道读，十分钟不到五兆。
export async function peaks(file, buckets = 160) {
  const { stdout } = await execBuffer('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-ac',
    '1',
    '-ar',
    '4000',
    '-f',
    's16le',
    '-',
  ]);
  const n = Math.floor(stdout.length / 2);
  const out = new Array(buckets).fill(0);
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const b = Math.min(buckets - 1, Math.floor((i / n) * buckets));
    const v = Math.abs(stdout.readInt16LE(i * 2)) / 32768;
    if (v > out[b]) out[b] = v;
  }
  return out.map(v => Math.round(v * 1000) / 1000);
}
