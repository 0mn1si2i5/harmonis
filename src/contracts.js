export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const speechModels = ['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo'];
export const basicEmotions = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'];
export function emotionsFor(model) {
  return model.startsWith('speech-2.6-') ? [...basicEmotions, 'fluent', 'whisper'] : basicEmotions;
}
export function number(value, fallback, min, max, name) {
  const n = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new UserError(`${name}须在 ${min}–${max} 之间`);
  return n;
}
export function required(value, name, max = 10000) {
  if (typeof value !== 'string' || !value.trim()) throw new UserError(`请填写${name}`);
  if (value.length > max) throw new UserError(`${name}不能超过 ${max} 字符`);
  return value;
}
export function validatePauseText(text) {
  const matches = [...text.matchAll(/<#(.*?)#>/g)];
  for (const m of matches) {
    if (!/^\d+(\.\d{1,2})?$/.test(m[1]) || Number(m[1]) < 0.01 || Number(m[1]) > 99.99)
      throw new UserError('停顿须为 0.01–99.99 秒，最多两位小数');
    const before = text.slice(0, m.index),
      after = text.slice(m.index + m[0].length);
    if (
      !before.replace(/<#.*?#>/g, '').trim() ||
      !after.replace(/<#.*?#>/g, '').trim() ||
      /^\s*<#/.test(after)
    )
      throw new UserError('停顿须放在两段文字之间，不能连续插入');
  }
  if (text.replace(/<#.*?#>/g, '').includes('<#')) throw new UserError('停顿标记未闭合');
  return text;
}
// 读音规则一行一条：原词/替换，替换里可以混写汉字和 (pin1)(yin1)；# 开头的行是注释
export function parsePronunciation(text) {
  if (typeof text !== 'string') return [];
  const rules = text
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#'));
  const bad = rules.find(s => !/^[^/]+\/.+$/.test(s));
  if (bad) throw new UserError(`读音规则格式：原词/替换读音，一行一条（出错的一行：${bad.slice(0, 40)}）`);
  if (rules.length > 500) throw new UserError('读音规则不能超过 500 条');
  return rules;
}
export function buildSpeech(input) {
  const text = validatePauseText(required(input.text, '配音文案', 9999));
  if (!speechModels.includes(input.model)) throw new UserError('请选择支持的 MiniMax 模型');
  const voiceId = required(input.voiceId, '音色', 256);
  const voice = {
    voice_id: voiceId,
    speed: number(input.speed, 1, 0.5, 2, '生成语速'),
    vol: number(input.volume, 1, 0.01, 10, '音量'),
    pitch: number(input.pitch, 0, -12, 12, '音调'),
  };
  if (!Number.isInteger(voice.pitch)) throw new UserError('音调须为整数');
  if (input.emotion && input.emotion !== 'auto') {
    if (!emotionsFor(input.model).includes(input.emotion))
      throw new UserError('所选模型不支持该情绪，请重新选择');
    voice.emotion = input.emotion;
  }
  const body = {
    model: input.model,
    text,
    stream: false,
    voice_setting: voice,
    audio_setting: { sample_rate: 44100, format: 'wav', channel: 1 },
    output_format: 'hex',
    // 句级时间戳（毫秒），用来导出和旁白逐字一致的字幕
    subtitle_enable: true,
  };
  const rules = parsePronunciation(input.pronunciation);
  if (rules.length) body.pronunciation_dict = { tone: rules };
  if (input.normalization && input.normalization !== 'off') {
    if (!['basic', 'quality'].includes(input.normalization)) throw new UserError('无效的文本规范化选项');
    body.text_normalization_mode = input.normalization;
  }
  return body;
}
export const musicFormats = ['mp3_44100_128', 'mp3_48000_192'];
export function buildMusic(input) {
  if (!['music_v1', 'music_v2', 'music_v2_5'].includes(input.model))
    throw new UserError('请选择支持的 ElevenLabs 音乐模型');
  const format = input.format || 'mp3_44100_128';
  if (!musicFormats.includes(format)) throw new UserError('不支持的音乐输出格式');
  const body = { model_id: input.model };
  let duration;
  if (input.mode === 'plan') {
    if (input.model === 'music_v1') throw new UserError('此分段编辑器对应 v2 / v2.5；v1 请使用描述模式');
    if (!Array.isArray(input.chunks) || !input.chunks.length || input.chunks.length > 30)
      throw new UserError('作曲结构需要 1–30 段');
    const styles = v =>
      typeof v === 'string'
        ? v
            .split(/[,，\n]/)
            .map(s => s.trim())
            .filter(Boolean)
        : [];
    const chunks = input.chunks.map(c => ({
      text: required(c.text, '段落描述或歌词', 4000),
      duration_ms: Math.round(number(c.seconds, 15, 3, 120, '段落时长') * 1000),
      positive_styles: styles(c.positive),
      negative_styles: styles(c.negative),
      context_adherence: 'high',
    }));
    if (chunks.some(c => c.positive_styles.length > 50 || c.negative_styles.length > 50))
      throw new UserError('每段风格标签最多 50 个');
    duration = chunks.reduce((n, c) => n + c.duration_ms, 0);
    if (duration > 600000) throw new UserError('总时长不能超过 10 分钟');
    body.composition_plan = { chunks };
  } else if (input.mode === 'prompt' || !input.mode) {
    body.prompt = required(input.prompt, '音乐描述', 4100);
    duration = Math.round(number(input.duration, 60, 3, 600, '音乐时长') * 1000);
    body.music_length_ms = duration;
    body.force_instrumental = input.instrumental !== false;
  } else throw new UserError('无效的音乐创作模式');
  return { body, format, duration: duration / 1000, estimatedUSD: (duration / 60000) * 0.15 };
}
