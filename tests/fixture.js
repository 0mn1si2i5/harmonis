import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
// Test-only synthetic audio; never installed into the user's library or returned by production providers.
export function wav(seconds = 1) {
  const n = 32000 * seconds,
    b = Buffer.alloc(44 + n * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(32000, 24);
  b.writeUInt32LE(64000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.round(Math.sin((i / 32000) * 440 * Math.PI * 2) * 3000), 44 + i * 2);
  return b;
}
export const speech = {
  text: '配音测试。',
  voiceId: 'voice_123456',
  model: 'speech-2.8-hd',
  speed: 1,
  emotion: 'auto',
};
export async function fixture(t, { onDeleteVoice } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shengjian-test-')),
    calls = [];
  let failText = '';
  const transport = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('files/upload'))
      return new Response('{"file":{"file_id":9223372036854775806},"base_resp":{"status_code":0}}');
    if (url.includes('voice_clone')) return Response.json({ base_resp: { status_code: 0 } });
    if (url.includes('delete_voice')) {
      if (onDeleteVoice) return onDeleteVoice(JSON.parse(options.body));
      return Response.json({ voice_id: JSON.parse(options.body).voice_id, base_resp: { status_code: 0 } });
    }
    if (url.includes('get_voice'))
      return Response.json({ voice_cloning: [{ voice_id: speech.voiceId }], base_resp: { status_code: 0 } });
    if (url.includes('t2a_v2')) {
      const body = JSON.parse(options.body);
      if (body.text === failText)
        return Response.json({
          base_resp: { status_code: 1008, status_msg: 'quota failed minimax-test-secret' },
        });
      return Response.json({
        data: {
          audio: wav().toString('hex'),
          subtitle_file: 'https://subtitles.test/' + calls.length + '.json',
        },
        extra_info: { audio_length: 1000 },
        trace_id: 'test-trace',
        base_resp: { status_code: 0 },
      });
    }
    if (url.startsWith('https://subtitles.test/'))
      return Response.json([
        { text: '配音', time_begin: 0, time_end: 400 },
        { text: '测试。', time_begin: 400, time_end: 950 },
      ]);
    if (url.includes('/v1/music'))
      return new Response(await fs.readFile(path.join(dir, 'music.mp3')), {
        headers: { 'content-type': 'audio/mpeg', 'song-id': 'test-song' },
      });
    throw new Error('Unexpected test request');
  };
  const { app, store } = createApp({ dataDir: dir, transport });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    await new Promise(r => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const request = async (route, method = 'GET', body) => {
    const res = await fetch(base + route, {
      method,
      headers: {
        'X-Shengjian': '1',
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  };
  const job = async id => {
    for (let n = 0; n < 200; n++) {
      const j = (await request('/api/state')).data.jobs.find(j => j.id === id);
      if (!['queued', 'running'].includes(j.status)) return j;
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('Job timed out in test');
  };
  await request('/api/settings', 'PUT', { minimax: 'minimax-test-secret', elevenlabs: 'eleven-test-secret' });
  await request('/api/voices/import', 'POST', { voiceId: speech.voiceId });
  const p = (await request('/api/projects', 'POST', { kind: 'speech' })).data;
  return {
    dir,
    calls,
    store,
    request,
    job,
    base,
    p,
    fail(text) {
      failText = text;
    },
  };
}
