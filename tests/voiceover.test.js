import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { wav, speech, fixture } from './fixture.js';
import { buildSpeech, parsePronunciation } from '../src/contracts.js';
import { analyze, processVoice, shiftCues, toSRT } from '../src/postprocess.js';
const exec = promisify(execFile);

async function scriptFolder(dir) {
  const folder = path.join(dir, '宣传片 第二期', '声音克隆稿');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'B站_01.txt'), '玩过的人说，这个游戏像一维元胞自动机。\n');
  await fs.writeFile(path.join(folder, 'B站_02.txt'), '一排牌，挨在一起的几张按配方反应。');
  await fs.writeFile(path.join(folder, '小红书_01.txt'), '这是我们做的卡牌解谜游戏。');
  await fs.writeFile(path.join(folder, '注音表.md'), '# 不是稿件');
  await fs.writeFile(path.join(folder, '读音词典.txt'), '# 注释\n一维/(yi1)(wei2)\n挨在/(ai1)在\n');
  return folder;
}

test('pronunciation rules skip comments and name the bad line', () => {
  assert.deepEqual(parsePronunciation('# 注释\n长到/(zhang3)到\n\n'), ['长到/(zhang3)到']);
  assert.throws(() => parsePronunciation('长到(zhang3)'), /长到\(zhang3\)/);
  const body = buildSpeech({ ...speech, pronunciation: '# 只有注释' });
  assert.equal('pronunciation_dict' in body, false);
  assert.equal(body.subtitle_enable, true);
});

test('script folder imports as named split projects with a shared dictionary, and reloads by name', async t => {
  const f = await fixture(t);
  const folder = await scriptFolder(f.dir);
  const preview = await f.request('/api/scripts/preview', 'POST', { dir: folder });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.title, '宣传片 第二期');
  assert.deepEqual(
    preview.data.groups.map(g => [g.name, g.segments]),
    [
      ['B站', 2],
      ['小红书', 1],
    ]
  );
  assert.equal(preview.data.dictionary, 2);
  const imported = await f.request('/api/scripts/import', 'POST', { dir: folder, groups: ['B站'] });
  assert.equal(imported.status, 201);
  const p = imported.data.projects[0];
  assert.equal(p.title, '宣传片 第二期 B站');
  assert.deepEqual(
    p.draft.segments.map(s => s.name),
    ['B站_01', 'B站_02']
  );
  assert.equal(p.draft.segments[0].text, '玩过的人说，这个游戏像一维元胞自动机。');
  assert.equal(p.draft.pronunciation, '一维/(yi1)(wei2)\n挨在/(ai1)在');

  await fs.writeFile(path.join(folder, 'B站_02.txt'), '一排牌，挨着的牌按配方反应。');
  await fs.writeFile(path.join(folder, 'B站_03.txt'), '第七关有四张牌。');
  const reloaded = await f.request('/api/scripts/reload', 'POST', { projectId: p.id });
  assert.deepEqual(reloaded.data.changed, ['B站_02']);
  assert.deepEqual(reloaded.data.added, ['B站_03']);
  assert.equal(reloaded.data.project.draft.segments[0].id, p.draft.segments[0].id);
  assert.equal(reloaded.data.project.draft.segments[1].text, '一排牌，挨着的牌按配方反应。');

  assert.equal((await f.request('/api/scripts/preview', 'POST', { dir: 'relative/path' })).status, 400);
});

test('segment names and subtitles travel with versions; project dictionary overrides segment settings', async t => {
  const f = await fixture(t);
  const result = await f.request('/api/speech', 'POST', {
    projectId: f.p.id,
    input: { ...speech, pronunciation: '一维/(yi1)(wei2)' },
    sections: [
      {
        text: '第一段',
        index: 0,
        segmentId: 'one',
        name: 'B站_01',
        settings: { pronunciation: '错/(cuo4)' },
      },
    ],
  });
  assert.equal((await f.job(result.data.id)).status, 'done');
  const body = JSON.parse(f.calls.find(c => c.url.endsWith('/t2a_v2')).options.body);
  assert.deepEqual(body.pronunciation_dict.tone, ['一维/(yi1)(wei2)']);
  const v = (await f.request('/api/state')).data.versions[0];
  assert.equal(v.input.segmentName, 'B站_01');
  assert.deepEqual(v.subtitles[1], { text: '测试。', begin: 400, end: 950 });

  const res = await fetch(`${f.base}/api/versions/${v.id}/audio?download=1`);
  assert.match(decodeURIComponent(res.headers.get('content-disposition')), /B站_01_/);
  await res.arrayBuffer();

  const exported = await f.request('/api/export', 'POST', {
    versionIds: [v.id],
    mode: 'zip',
    format: 'wav',
    process: { trim: true, loudness: true, sampleRate48: true },
    srt: true,
    title: '宣传片 B站',
  });
  assert.equal(exported.status, 200);
  const zipRes = await fetch(f.base + exported.data.url);
  assert.match(decodeURIComponent(zipRes.headers.get('content-disposition')), /宣传片 B站\.zip/);
  const zip = path.join(f.dir, 'out.zip');
  await fs.writeFile(zip, Buffer.from(await zipRes.arrayBuffer()));
  const { stdout } = await exec('python3', [
    '-c',
    'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))',
    zip,
  ]);
  assert.deepEqual(stdout.trim().split('\n').sort(), ['B站_01.srt', 'B站_01.wav']);
  // 下载一次就删掉
  assert.equal((await fetch(f.base + exported.data.url)).status, 404);
  // 不做成品处理时也按选的格式出文件
  const plain = await f.request('/api/export', 'POST', { versionIds: [v.id], mode: 'zip', format: 'mp3' });
  await fs.writeFile(zip, Buffer.from(await (await fetch(f.base + plain.data.url)).arrayBuffer()));
  const listed = await exec('python3', [
    '-c',
    'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))',
    zip,
  ]);
  assert.equal(listed.stdout.trim(), 'B站_01.mp3');

  assert.equal((await f.request('/api/versions/' + v.id, 'DELETE')).status, 200);
  assert.equal((await f.request('/api/state')).data.versions.length, 0);
  assert.deepEqual(await fs.readdir(path.join(f.dir, 'audio')), []);
});

test('deleting a project removes its versions and audio', async t => {
  const f = await fixture(t);
  const result = await f.request('/api/speech', 'POST', { projectId: f.p.id, input: speech });
  await f.job(result.data.id);
  assert.equal((await fs.readdir(path.join(f.dir, 'audio'))).length, 1);
  const deleted = await f.request('/api/projects/' + f.p.id, 'DELETE');
  assert.equal(deleted.data.versions, 1);
  const state = (await f.request('/api/state')).data;
  assert.equal(state.projects.length, 0);
  assert.equal(state.versions.length, 0);
  assert.deepEqual(await fs.readdir(path.join(f.dir, 'audio')), []);
});

test('uploads report peak, level, noise floor and loudness', async t => {
  const f = await fixture(t);
  const form = new FormData();
  form.append('audio', new Blob([wav(11)]), 'recording.wav');
  const uploaded = await f.request('/api/uploads', 'POST', form);
  const a = uploaded.data.analysis;
  // 测试音是振幅 3000/32768 的正弦：峰值约 -20.8 dBFS
  assert.ok(Math.abs(a.peakDb - -20.8) < 0.5, JSON.stringify(a));
  assert.ok(a.lufs < -15 && a.lufs > -30, JSON.stringify(a));
});

test('voice processing trims silence, normalizes loudness and keeps subtitles aligned', async t => {
  const f = await fixture(t);
  const source = path.join(f.dir, 'padded.wav');
  // 0.6 秒静音 + 2 秒正弦 + 0.8 秒静音
  await exec('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=f=220:r=32000:d=2,volume=0.2,adelay=600,apad=pad_dur=0.8',
    '-ac',
    '1',
    source,
  ]);
  const dest = path.join(f.dir, 'out.wav');
  const r = await processVoice(source, dest, { trim: true, loudness: true, sampleRate: 48000 });
  assert.ok(Math.abs(r.offset - 0.5) < 0.03, String(r.offset));
  assert.ok(Math.abs(r.duration - 2.2) < 0.05, String(r.duration));
  const a = await analyze(dest);
  assert.ok(Math.abs(a.lufs - -16) < 1, JSON.stringify(a));
  const cues = shiftCues([{ text: '你好<#0.5#>世界', begin: 600, end: 2600 }], -r.offset, r.duration);
  assert.equal(cues[0].text, '你好世界');
  assert.match(toSRT(cues), /^1\n00:00:00,1\d\d --> 00:00:02,1\d\d\n你好世界\n$/);
});
