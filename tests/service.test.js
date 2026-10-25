import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.js';
import { probe, transcode } from '../src/audio.js';
import { wav, speech, fixture } from './fixture.js';
test('upload -> clone keeps int64 IDs and normalizes audio; rejects invalid files', async t => {
  const f = await fixture(t);
  let form = new FormData();
  form.append('audio', new Blob([wav(11)]), 'recording.wav');
  const uploaded = await f.request('/api/uploads', 'POST', form);
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.duration, 11);
  const cloned = await f.request('/api/clone', 'POST', { name: '测试音色', uploadId: uploaded.data.id });
  assert.equal((await f.job(cloned.data.id)).status, 'done');
  const call = f.calls.find(c => c.url.endsWith('/voice_clone'));
  assert.match(call.options.body, /"file_id":9223372036854775806/);
  assert.equal('text' in JSON.parse(call.options.body), false);
  assert.equal(f.store.data.voices.length, 2);
  form = new FormData();
  form.append('audio', new Blob(['not audio']), 'fake.wav');
  assert.equal((await f.request('/api/uploads', 'POST', form)).status, 400);
  assert.equal((await fs.readdir(path.join(f.dir, 'tmp'))).length, 0);
});
test('each section uses its own API parameters; saved versions survive edits and downloads', async t => {
  const f = await fixture(t);
  const result = await f.request('/api/speech', 'POST', {
    projectId: f.p.id,
    input: speech,
    sections: [
      { text: '第一段', index: 0, segmentId: 'one', settings: { speed: 0.8, emotion: 'sad' } },
      { text: '第二段', index: 1, segmentId: 'two', settings: { speed: 1.7, emotion: 'happy' } },
    ],
  });
  const j = await f.job(result.data.id);
  assert.equal(j.status, 'done');
  assert.equal(j.results.length, 2);
  const calls = f.calls.filter(c => c.url.endsWith('/t2a_v2')).map(c => JSON.parse(c.options.body));
  assert.deepEqual(
    calls.map(c => c.voice_setting.speed),
    [0.8, 1.7]
  );
  assert.deepEqual(
    calls.map(c => c.voice_setting.emotion),
    ['sad', 'happy']
  );
  await f.request('/api/projects/' + f.p.id, 'PUT', { draft: { ...speech, speed: 2, text: '新草稿' } });
  const restored = openStore(f.dir);
  assert.equal(restored.data.versions.find(v => v.input.segmentId === 'one').input.speed, 0.8);
  const raw = await fetch(f.base + '/api/versions/' + j.results[0] + '/audio?download=1');
  assert.equal(raw.status, 200);
  assert.match(raw.headers.get('content-disposition'), /attachment/);
  assert.equal(
    Buffer.from(await raw.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    'RIFF'
  );
  const mp3 = await fetch(f.base + '/api/versions/' + j.results[0] + '/audio?download=1&format=mp3');
  assert.equal(mp3.status, 200);
  assert.match(mp3.headers.get('content-type'), /audio/);
  await mp3.arrayBuffer();
  for (const mode of ['zip', 'merge']) {
    const ex = await f.request('/api/export', 'POST', { versionIds: j.results, mode, format: 'wav' });
    assert.equal(ex.status, 200);
    const bytes = Buffer.from(await (await fetch(f.base + ex.data.url)).arrayBuffer());
    if (mode === 'zip') assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    else {
      const file = path.join(f.dir, 'merged.wav');
      await fs.writeFile(file, bytes);
      assert.ok(Math.abs((await probe(file)).duration - 2) < 0.02);
    }
  }
});
test('partial failure retains successful version; errors and state never expose keys', async t => {
  const f = await fixture(t);
  f.fail('失败');
  const result = await f.request('/api/speech', 'POST', {
    projectId: f.p.id,
    input: speech,
    sections: [
      { text: '成功', index: 0 },
      { text: '失败', index: 1 },
    ],
  });
  const j = await f.job(result.data.id);
  assert.equal(j.status, 'failed');
  assert.equal(j.results.length, 1);
  assert.match(j.error, /已隐藏/);
  assert.doesNotMatch(
    JSON.stringify((await f.request('/api/state')).data),
    /minimax-test-secret|eleven-test-secret/
  );
  const blocked = await fetch(f.base + '/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere.example', 'X-Shengjian': '1' },
    body: '{}',
  });
  assert.equal(blocked.status, 403);
  const permission = (await fs.stat(path.join(f.dir, 'settings.json'))).mode & 0o777;
  assert.equal(permission, 0o600);
});
test('ElevenLabs music request saves real media bytes and exact prompt/plan contracts', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.dir, 'music.wav'), wav());
  await transcode(path.join(f.dir, 'music.wav'), path.join(f.dir, 'music.mp3'), 'mp3');
  const p = (await f.request('/api/projects', 'POST', { kind: 'music' })).data;
  const input = {
    model: 'music_v2_5',
    mode: 'prompt',
    prompt: 'Gentle piano',
    duration: 30,
    instrumental: true,
    format: 'mp3_44100_128',
  };
  const r = await f.request('/api/music', 'POST', { projectId: p.id, input });
  const j = await f.job(r.data.id);
  assert.equal(j.status, 'done');
  const call = f.calls.find(c => c.url.includes('/v1/music'));
  const body = JSON.parse(call.options.body);
  assert.equal(body.music_length_ms, 30000);
  assert.equal(body.force_instrumental, true);
  assert.equal(body.composition_plan, undefined);
  assert.equal(f.store.data.versions[0].providerId, 'test-song');
  assert.ok(f.store.data.versions[0].duration > 0);
});
test('missing key fails before upstream calls; restart marks unfinished outcome unknown', async t => {
  const f = await fixture(t);
  f.store.saveKeys({ minimax: '' });
  const count = f.calls.length;
  const r = await f.request('/api/speech', 'POST', { projectId: f.p.id, input: speech });
  assert.equal(r.status, 400);
  assert.equal(f.calls.length, count);
  f.store.data.jobs.push({ id: 'unfinished', status: 'running' });
  f.store.save();
  assert.equal(openStore(f.dir).data.jobs[0].status, 'interrupted');
});
test('browser-style WebM without duration metadata is accepted after decoding', async t => {
  const f = await fixture(t);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const source = path.join(f.dir, 'source.wav');
  await fs.writeFile(source, wav(11));
  const { stdout } = await promisify(execFile)(
    'ffmpeg',
    ['-v', 'error', '-i', source, '-c:a', 'libopus', '-f', 'webm', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 }
  );
  const form = new FormData();
  form.append('audio', new Blob([stdout], { type: 'audio/webm' }), 'browser.webm');
  const upload = await f.request('/api/uploads', 'POST', form);
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  assert.ok(upload.data.duration >= 10.9 && upload.data.duration <= 11.1);
});

test('settings identify subscription keys without exposing them and explain the separate wallet', async t => {
  const f = await fixture(t);
  const subscriptionKey = 'sk-cp-test-secret-key';
  await f.request('/api/settings', 'PUT', { minimax: subscriptionKey });
  const state = (await f.request('/api/state')).data;
  assert.equal(state.settings.minimaxKeyType, 'subscription');
  assert.equal(JSON.stringify(state).includes(subscriptionKey), false);
  const checked = await f.request('/api/settings/test/minimax', 'POST', {});
  assert.equal(checked.status, 200);
  assert.match(checked.data.message, /订阅 Key/);
  assert.match(checked.data.message, /不会使用按量钱包余额/);
  await f.request('/api/settings', 'PUT', { minimax: 'sk-api-test-secret-key' });
  assert.equal((await f.request('/api/state')).data.settings.minimaxKeyType, 'payg');
});
