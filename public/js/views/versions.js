import { currentVersions } from '../draft.js';
import { markup, fmtTime, date, esc, icon, $, $$ } from '../util.js';
import { state } from '../state.js';
import { labels } from '../constants.js';
import { api } from '../api.js';

const versionTitle = v =>
  v.kind === 'music'
    ? '音乐'
    : v.kind === 'score'
      ? `编曲 · ${v.input.score.replace(/\.py$/, '')}${v.grid?.loop ? ` · ${v.grid.bars} 小节循环` : ''}`
      : v.input?.segmentName ||
        (v.sectionIndex === null ? '整篇配音' : '第 ' + (Number(v.sectionIndex) + 1) + ' 段');
function versionMeta(v) {
  if (v.kind === 'score')
    return `${v.grid ? `${v.grid.bpm} BPM · ${v.grid.bars} 小节 · ` : ''}种子 ${v.input.seed ?? '默认'} · ${date(v.createdAt)}`;
  return `${esc(v.input.model)}${v.kind === 'speech' ? ' · 语速 ' + v.input.speed + ' · ' + esc(labels[v.input.emotion] || '自动') : ''} · ${date(v.createdAt)}`;
}
const waveHTML = v =>
  `<svg class="wave" data-wave="${v.id}" viewBox="0 0 160 24" preserveAspectRatio="none" aria-hidden="true"></svg>`;

// 配音页：只列当前段（或整篇）的版本；最早的是第 1 版
function takesHTML(versions, chosenId, label) {
  const ordered = [...versions].reverse();
  return markup`<section class="panel takes">
    <div class="panel-head">
      <strong>${label} <span class="muted num">${versions.length}</span></strong>
      ${chosenId ? `<a class="btn small ghost" href="/api/versions/${chosenId}/audio?download=1">${icon('download')}下载选定版本</a>` : ''}
    </div>
    ${
      ordered.length
        ? ordered
            .map((v, n) => takeRow(v, n + 1, v.id === chosenId))
            .reverse()
            .join('')
        : '<div class="empty">还没有生成。点右边的生成按钮，每次生成都会留一版。</div>'
    }
  </section>`;
}
function takeRow(v, n, chosen) {
  return markup`<div class="take ${chosen ? 'chosen' : ''} ${state.currentVersion === v.id ? 'playing' : ''}" data-take="${v.id}">
    <button class="play" data-action="play" data-id="${v.id}" aria-label="试听第 ${n} 版">${icon('play')}</button>
    <div class="take-info">
      <div class="num">第 ${n} 版 · ${v.duration.toFixed(1)} 秒</div>
      <small class="num">${versionMeta(v)}</small>
      ${waveHTML(v)}
    </div>
    <div class="take-actions">
      <button class="pick ${chosen ? 'on' : ''}" data-action="choose" data-id="${v.id}" aria-pressed="${chosen}">${chosen ? '已选定' : '选定'}</button>
      <button class="btn small ghost" data-action="version-detail" data-id="${v.id}">参数</button>
      <a class="btn small ghost" href="/api/versions/${v.id}/audio?download=1" aria-label="下载第 ${n} 版">${icon('download')}</a>
      <button class="btn small ghost danger" data-action="delete-version" data-id="${v.id}" aria-label="删除第 ${n} 版">删除</button>
    </div>
  </div>`;
}
// 波形：服务端算好峰值，这里只画竖条
async function drawWaves() {
  state.peaks ??= new Map();
  for (const el of $$('[data-wave]')) {
    const id = el.dataset.wave;
    if (!state.peaks.has(id))
      state.peaks.set(
        id,
        api(`/api/versions/${id}/peaks`).then(
          r => r.peaks,
          () => []
        )
      );
    const peaks = await state.peaks.get(id);
    if (!el.isConnected) continue;
    const w = 160 / Math.max(peaks.length, 1);
    el.innerHTML =
      peaks
        .map((p, i) => {
          const h = Math.max(1, Math.min(1, p * 1.4) * 24);
          return `<rect x="${(i * w).toFixed(2)}" y="${((24 - h) / 2).toFixed(2)}" width="${(w * 0.6).toFixed(2)}" height="${h.toFixed(2)}"/>`;
        })
        .join('') + barLines(state.db.versions.find(v => v.id === id));
  }
}

// 编曲版本在波形上画小节线，弱起之后第 1 小节起每小节一条
function barLines(v) {
  const g = v?.grid;
  if (!g?.bpm || !v.duration) return '';
  const beat = 60 / g.bpm;
  let out = '';
  for (let k = 0; k <= g.bars; k++) {
    const x = (((g.pickupBeats + k * g.beatsPerBar) * beat) / v.duration) * 160;
    if (x > 160.01) break;
    out += `<line class="bar-line" x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="0" y2="24" vector-effect="non-scaling-stroke"/>`;
  }
  return out;
}

// 音乐页、编曲页和作品库沿用勾选导出
function versionsHTML() {
  const versions = currentVersions();
  return markup`<section class="panel versions">
    <div class="panel-head">
      <strong>生成记录 <span class="muted num">${versions.length}</span></strong>
      <button class="btn small ghost" data-action="export">导出已勾选版本</button>
    </div>${versions.length ? versions.map(v => versionRow(v)).join('') : '<div class="empty">还没有生成。每次生成都会留一版，可以反复试听和下载。</div>'}
  </section>`;
}
function versionRow(v) {
  return markup`<div class="version-row ${state.currentVersion === v.id ? 'selected' : ''}">
    <input type="checkbox" aria-label="选择导出版本 ${v.id.slice(0, 6)}" data-version-check="${v.id}" ${state.selected.has(v.id) ? 'checked' : ''}>
    <button class="version-info" data-action="play" data-id="${v.id}">
      <b>${esc(versionTitle(v))} · <span class="num">${fmtTime(v.duration)}</span></b>
      <small class="num">${versionMeta(v)} · ${v.id.slice(0, 6)}</small>
      ${waveHTML(v)}
    </button>
    <div class="version-actions">
      <button class="btn small ghost" data-action="version-detail" data-id="${v.id}">参数</button>
      <a class="btn small ghost" href="/api/versions/${v.id}/audio?download=1">下载</a>
      <button class="btn small ghost danger" data-action="delete-version" data-id="${v.id}">删除</button>
    </div>
  </div>`;
}
function playerHTML() {
  const v = state.db.versions.find(v => v.id === state.currentVersion);
  if (!v) return '<div class="player-empty">选一版试听。</div>';
  return markup`<div class="player-info">
    <b>${esc(versionTitle(v))}</b>
    <small class="num">${esc(state.db.projects.find(p => p.id === v.projectId)?.title || '')} · ${fmtTime(v.duration)} · ${v.id.slice(0, 6)}</small>
  </div>
  <audio id="audio-player" controls preload="metadata" src="/api/versions/${v.id}/audio"></audio>
  <a class="btn small ghost" href="/api/versions/${v.id}/audio?download=1&format=wav">${icon('download')}WAV</a>
  <a class="btn small ghost" href="/api/versions/${v.id}/audio?download=1&format=mp3">MP3</a>`;
}
async function playVersion(id) {
  state.currentVersion = id;
  $('#player').innerHTML = playerHTML();
  $$('.version-row').forEach(el =>
    el.classList.toggle('selected', el.querySelector('[data-action="play"]')?.dataset.id === id)
  );
  $$('.take').forEach(el => el.classList.toggle('playing', el.dataset.take === id));
  await $('#audio-player')
    .play()
    .catch(() => {});
}

export { takesHTML, drawWaves, versionsHTML, versionRow, versionTitle, playerHTML, playVersion };
