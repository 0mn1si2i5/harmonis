import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { mediaExecutable } from './paths.js';
import { UserError } from './contracts.js';
const exec = promisify(execFile);
export async function run(command, args) {
  try {
    return await exec(mediaExecutable(command), args, { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  } catch (e) {
    if (e.code === 'ENOENT') throw new UserError('需要安装 ffmpeg 和 ffprobe 后才能处理音频', 503);
    throw new UserError('无法读取或处理这段音频，请使用有效的 MP3、M4A、WAV 或浏览器录音');
  }
}
export async function dependencies() {
  try {
    await exec(mediaExecutable('ffmpeg'), ['-version']);
    await exec(mediaExecutable('ffprobe'), ['-version']);
    return true;
  } catch {
    return false;
  }
}
export async function probe(file, allowUnknownDuration = false) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-protocol_whitelist',
    'file,pipe',
    '-show_entries',
    'format=duration,size:stream=codec_type,sample_rate,channels',
    '-of',
    'json',
    file,
  ]);
  const info = JSON.parse(stdout);
  const duration = Number(info.format?.duration);
  if (
    !info.streams?.some(s => s.codec_type === 'audio') ||
    (!allowUnknownDuration && (!Number.isFinite(duration) || duration <= 0))
  )
    throw new UserError('文件中没有可用的音频');
  return { duration, bytes: Number(info.format.size), streams: info.streams };
}
export async function normalize(source, dest, reference = false) {
  const validDuration = duration =>
    reference ? duration >= 0.2 && duration < 8 : duration >= 10 && duration <= 300;
  const durationError = () =>
    new UserError(reference ? '参考音频须短于 8 秒' : '克隆录音须为 10 秒至 5 分钟');
  const sourceInfo = await probe(source, true);
  if (Number.isFinite(sourceInfo.duration) && !validDuration(sourceInfo.duration)) throw durationError();
  // MediaRecorder WebM often has no duration header. Decode first and measure the resulting WAV.
  await run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-protocol_whitelist',
    'file,pipe',
    '-i',
    source,
    '-map',
    '0:a:0',
    '-vn',
    '-t',
    reference ? '9' : '301',
    '-ac',
    '1',
    '-ar',
    '32000',
    '-c:a',
    'pcm_s16le',
    dest,
  ]);
  const info = await probe(dest);
  if (!validDuration(info.duration)) throw durationError();
  if (info.bytes > 20 * 1024 * 1024) throw new UserError('转换后音频超过 20 MB');
  return { ...info, format: 'wav' };
}
export async function transcode(source, dest, format, channels) {
  await run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    source,
    '-map',
    '0:a:0',
    '-vn',
    ...(channels ? ['-ac', String(channels)] : []),
    '-ar',
    '44100',
    ...(format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'pcm_s16le']),
    dest,
  ]);
}
export async function wrapPCM(source, dest) {
  await run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    's16le',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-i',
    source,
    '-c:a',
    'pcm_s16le',
    dest,
  ]);
}
export async function merge(files, dest, sampleRate = 44100) {
  if (!files.length) throw new UserError('请先选择需要合并的音频');
  const list = dest + '.txt';
  await fs.writeFile(list, files.map(f => `file '${f.replaceAll("'", "'\\''")}'`).join('\n'));
  try {
    await run('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-ac',
      '2',
      '-ar',
      String(sampleRate),
      '-c:a',
      'pcm_s16le',
      dest,
    ]);
  } finally {
    await fs.rm(list, { force: true });
  }
}
