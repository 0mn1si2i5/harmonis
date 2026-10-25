import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeech, buildMusic, validatePauseText } from '../src/contracts.js';
import { stringifyAPI, parseAPI } from '../src/providers.js';
const base = {
  text: '这是一次配音。',
  voiceId: 'MyVoice123',
  model: 'speech-2.8-hd',
  speed: 1,
  emotion: 'auto',
};
test('speech maps full speed range and omits automatic emotion', () => {
  assert.equal(buildSpeech({ ...base, speed: 0.5 }).voice_setting.speed, 0.5);
  assert.equal(buildSpeech({ ...base, speed: 2 }).voice_setting.speed, 2);
  assert.equal('emotion' in buildSpeech(base).voice_setting, false);
  assert.throws(() => buildSpeech({ ...base, speed: 2.1 }));
});
test('emotion must be supported by the chosen model', () => {
  assert.throws(() => buildSpeech({ ...base, emotion: 'whisper' }));
  assert.throws(() => buildSpeech({ ...base, emotion: 'excited' }));
  assert.equal(
    buildSpeech({ ...base, model: 'speech-2.6-hd', emotion: 'whisper' }).voice_setting.emotion,
    'whisper'
  );
});
test('pause boundaries reject invalid markers without stripping valid pronunciation', () => {
  assert.throws(() => validatePauseText('<#0.5#>你好'));
  assert.throws(() => validatePauseText('你好<#0.5#><#0.2#>再见'));
  assert.throws(() => validatePauseText('你好<#100#>再见'));
  assert.equal(buildSpeech({ ...base, text: '长(zhang3)大<#0.5#>了。' }).text, '长(zhang3)大<#0.5#>了。');
});
test('upload IDs survive a round trip as int64 JSON numbers', () => {
  const raw = '{"file_id":9223372036854775806}';
  const result = parseAPI(raw);
  assert.equal(String(result.file_id), '9223372036854775806');
  assert.equal(stringifyAPI({ file_id: BigInt(String(result.file_id)) }), raw);
});
test('music prompt and composition plan are exclusive and preserve durations', () => {
  const p = buildMusic({
    model: 'music_v2_5',
    mode: 'prompt',
    prompt: 'Warm piano',
    duration: 75,
    instrumental: true,
    format: 'mp3_44100_128',
  });
  assert.equal(p.body.music_length_ms, 75000);
  assert.equal(p.body.force_instrumental, true);
  const c = buildMusic({
    model: 'music_v2_5',
    mode: 'plan',
    chunks: [{ text: '[Intro]', seconds: 10, positive: 'piano', negative: 'vocals' }],
    format: 'mp3_44100_128',
  });
  assert.equal(c.body.composition_plan.chunks[0].duration_ms, 10000);
  assert.equal('force_instrumental' in c.body, false);
  assert.throws(() => buildMusic({ model: 'music_v1', mode: 'plan', chunks: [], format: 'mp3_44100_128' }));
});
