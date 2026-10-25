const speechDefaults = {
  model: 'speech-2.8-hd',
  voiceId: '',
  speed: 1,
  emotion: 'auto',
  volume: 1,
  pitch: 0,
  pronunciation: '',
  normalization: 'off',
  mode: 'whole',
  text: '',
  segments: [],
};
const musicDefaults = {
  model: 'music_v2_5',
  mode: 'prompt',
  prompt: '',
  duration: 60,
  instrumental: true,
  format: 'mp3_44100_128',
  chunks: [
    { text: '[Intro]', seconds: 10, positive: 'warm piano, instrumental', negative: 'vocals' },
    { text: '[Main]', seconds: 40, positive: 'soft beat, instrumental', negative: 'vocals' },
    { text: '[Outro]', seconds: 10, positive: 'gentle ending', negative: 'vocals' },
  ],
};
const scoreDefaults = {
  score: 'template_150.py',
  plucks: '',
  loop: false,
  bars: null,
  seed: null,
};
const labels = {
  auto: '自动 · 根据文案',
  happy: '高兴',
  sad: '悲伤',
  angry: '愤怒',
  fearful: '害怕',
  disgusted: '厌恶',
  surprised: '惊讶',
  calm: '中性 / 平静',
  fluent: '生动',
  whisper: '低语',
};

export { speechDefaults, musicDefaults, scoreDefaults, labels };
