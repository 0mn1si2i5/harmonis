import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { findPython, listScores, scoreInput } from '../src/synth.js';

const python = await findPython();

test('score list reads titles and tempo from the score files', async () => {
  const scores = await listScores();
  const template = scores.find(s => s.file === 'template_150.py');
  assert.equal(template.bpm, 150);
  assert.equal(template.bars, 8);
  assert.ok(template.title.length > 0);
});

test('score input rejects paths and bad numbers', () => {
  assert.throws(() => scoreInput({ score: '../server.js' }), /曲谱/);
  assert.throws(() => scoreInput({ score: 'a.py', bars: 2.5 }), /小节数/);
  assert.deepEqual(scoreInput({ score: 'a.py', bars: '6', loop: true }), {
    score: 'a.py',
    plucks: '',
    loop: true,
    bars: 6,
    seed: null,
  });
});

test(
  'score projects render locally into versions with a bar grid',
  { skip: !python && '没有装 numpy/scipy 的 Python' },
  async t => {
    const f = await fixture(t);
    const p = (await f.request('/api/projects', 'POST', { kind: 'score' })).data;
    assert.equal(p.kind, 'score');
    const job = await f.request('/api/score', 'POST', {
      projectId: p.id,
      input: { score: 'template_150.py', loop: true, bars: 2, plucks: '小节,拍,牌数\n1,0,4\n1,1,5\n' },
    });
    assert.equal(job.status, 202);
    const done = await f.job(job.data.id);
    assert.equal(done.status, 'done', done.error);
    const v = (await f.request('/api/state')).data.versions.find(v => v.projectId === p.id);
    assert.equal(v.kind, 'score');
    // 150 BPM 两小节循环正好 3.2 秒
    assert.ok(Math.abs(v.duration - 3.2) < 0.01, String(v.duration));
    assert.deepEqual(
      { bpm: v.grid.bpm, bars: v.grid.bars, loop: v.grid.loop, pickupBeats: v.grid.pickupBeats },
      { bpm: 150, bars: 2, loop: true, pickupBeats: 0 }
    );
    const bad = await f.request('/api/score', 'POST', {
      projectId: p.id,
      input: { score: 'template_150.py', plucks: '1,x,4' },
    });
    const failed = await f.job(bad.data.id);
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /拨弦/);
  }
);
