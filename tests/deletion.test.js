import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, speech, wav } from './fixture.js';
import { openStore } from '../src/store.js';

test('local voice removal clears draft references, retains audio, and never calls remote deletion', async t => {
  const f = await fixture(t);
  await f.request('/api/projects/' + f.p.id, 'PUT', {
    draft: {
      ...speech,
      segments: [
        { id: 'one', settings: { voiceId: speech.voiceId } },
        { id: 'two', settings: { voiceId: 'another_voice' } },
      ],
    },
  });
  const started = await f.request('/api/speech', 'POST', { projectId: f.p.id, input: speech });
  const job = await f.job(started.data.id);
  assert.equal(job.status, 'done');
  const voice = f.store.data.voices[0];
  assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'local' })).status, 200);
  const db = openStore(f.dir).data;
  assert.equal(db.voices.length, 0);
  assert.equal(db.projects[0].draft.voiceId, '');
  assert.equal(db.projects[0].draft.segments[0].settings.voiceId, '');
  assert.equal(db.projects[0].draft.segments[1].settings.voiceId, 'another_voice');
  assert.equal(db.versions.length, 1);
  assert.equal((await fetch(f.base + '/api/versions/' + job.results[0] + '/audio')).status, 200);
  assert.equal(
    f.calls.some(c => c.url.endsWith('/delete_voice')),
    false
  );
  assert.equal((await f.request('/api/speech', 'POST', { projectId: f.p.id, input: speech })).status, 400);
});

test('cloud voice deletion uses the exact MiniMax contract and requires explicit scope', async t => {
  const f = await fixture(t),
    voice = f.store.data.voices[0];
  assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', {})).status, 400);
  assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'provider' })).status, 200);
  assert.deepEqual(JSON.parse(f.calls.find(c => c.url.endsWith('/delete_voice')).options.body), {
    voice_type: 'voice_cloning',
    voice_id: speech.voiceId,
  });
  assert.equal(f.store.data.voices.length, 0);
  assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'local' })).status, 404);
});

test('remote failure retains the voice and blocks conflicting use while deletion is pending', async t => {
  let release, entered;
  const started = new Promise(r => (entered = r));
  const f = await fixture(t, {
    onDeleteVoice: async () => {
      entered();
      await new Promise(r => (release = r));
      return Response.json({ base_resp: { status_code: 1008, status_msg: 'insufficient balance' } });
    },
  });
  const voice = f.store.data.voices[0];
  const deletion = f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'provider' });
  await started;
  try {
    assert.equal((await f.request('/api/speech', 'POST', { projectId: f.p.id, input: speech })).status, 409);
    assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'local' })).status, 409);
    assert.equal((await f.request('/api/settings/minimax', 'DELETE')).status, 409);
  } finally {
    release();
  }
  assert.equal((await deletion).status, 502);
  assert.equal(f.store.data.voices[0].id, voice.id);
  // A failed cloud deletion does not strand the local entry in a locked state.
  assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'local' })).status, 200);
});

test('a mismatched cloud deletion response keeps the local voice', async t => {
  const f = await fixture(t, {
    onDeleteVoice: () => Response.json({ voice_id: 'wrong_id', base_resp: { status_code: 0 } }),
  });
  const voice = f.store.data.voices[0];
  assert.equal((await f.request('/api/voices/' + voice.id, 'DELETE', { scope: 'provider' })).status, 502);
  assert.equal(f.store.data.voices.length, 1);
});

test('recording deletion removes its file, retains the cloned voice, and protects active cloning', async t => {
  const f = await fixture(t),
    form = new FormData();
  form.append('audio', new Blob([wav(11)]), '录音样本.wav');
  const u = (await f.request('/api/uploads', 'POST', form)).data;
  assert.equal(u.name, '录音样本.wav');
  f.store.data.uploads[0].name = Buffer.from('旧录音.wav', 'utf8').toString('latin1');
  assert.equal((await f.request('/api/state')).data.uploads[0].name, '旧录音.wav');
  const file = path.join(f.dir, 'uploads', f.store.data.uploads[0].file);
  f.store.data.voices[0].uploadId = u.id;
  f.store.data.jobs.push({ id: 'busy', provider: 'minimax', type: 'clone', status: 'running', results: [] });
  assert.equal((await f.request('/api/uploads/' + u.id, 'DELETE')).status, 409);
  assert.equal(
    (await f.request('/api/voices/' + f.store.data.voices[0].id, 'DELETE', { scope: 'local' })).status,
    409
  );
  await fs.access(file);
  f.store.data.jobs[0].status = 'done';
  assert.equal((await f.request('/api/uploads/' + u.id, 'DELETE')).status, 200);
  await assert.rejects(fs.access(file), { code: 'ENOENT' });
  assert.equal(f.store.data.voices.length, 1);
  assert.equal(f.store.data.voices[0].uploadId, undefined);
  assert.equal((await f.request('/api/uploads/' + u.id + '/audio')).status, 404);
});

test('history cleanup preserves active jobs and assets; key removal is provider-specific', async t => {
  const f = await fixture(t);
  f.store.data.jobs.push(
    ...['done', 'failed', 'interrupted', 'running', 'queued'].map(status => ({
      id: status,
      status,
      provider: 'minimax',
      results: [],
    }))
  );
  assert.equal((await f.request('/api/settings/minimax', 'DELETE')).status, 409);
  assert.equal((await f.request('/api/jobs', 'DELETE')).data.deleted, 3);
  assert.deepEqual(
    f.store.data.jobs.map(j => j.status),
    ['running', 'queued']
  );
  assert.equal(f.store.data.voices.length, 1);
  assert.equal(f.store.data.projects.length, 1);
  assert.equal((await f.request('/api/settings/elevenlabs', 'DELETE')).status, 200);
  assert.equal(f.store.keys().elevenlabs, '');
  assert.equal(f.store.keys().minimax, 'minimax-test-secret');
  assert.equal((await f.request('/api/settings/anything', 'DELETE')).status, 400);
  f.store.data.jobs = [];
  assert.equal((await f.request('/api/settings/minimax', 'DELETE')).status, 200);
  assert.equal(openStore(f.dir).keys().minimax, '');
});
