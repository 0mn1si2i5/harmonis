import { serviceLinks } from './service-links.js';
import {
  project,
  scheduleSave,
  draft,
  updateDraft,
  updateParam,
  speechInput,
  takeStatus,
  currentSegment,
} from './draft.js';
import { $, markup, icon, esc, $$ } from './util.js';
import { state } from './state.js';
import { taskHTML } from './views/tasks.js';
import { speechHTML, tagHTML, segMeta, countText, overrideInner } from './views/speech.js';
import { musicHTML, musicCost } from './views/music.js';
import { scoreHTML, scoreNote, pluckCount } from './views/score.js';
import { playerHTML, drawWaves } from './views/versions.js';
import { voicesHTML } from './views/voices.js';
import { settingsHTML } from './views/settings.js';
import { libraryHTML } from './views/library.js';
import { toast, api, showError } from './api.js';
const VIEWS = [
  ['speech', 'mic', '配音', 'MiniMax'],
  ['music', 'music', '音乐', 'ElevenLabs'],
  ['score', 'score', '编曲', '本机合成'],
  ['voices', 'grid', '我的音色', ''],
  ['library', 'download', '作品库', ''],
  ['settings', 'settings', '服务设置', ''],
];
const viewName = v => VIEWS.find(x => x[0] === v)?.[2] || '';
const chip = (label, ok, title) =>
  `<span class="chip ${ok ? '' : 'off'}" title="${esc(title)}"><i class="dot"></i>${label}</span>`;
// 顶栏只放状态：进行中的任务、两个 Key、ffmpeg
function statusHTML() {
  const running = state.db.jobs.filter(j => ['queued', 'running'].includes(j.status));
  const ffmpeg = state.db.tools?.ffmpeg,
    python = state.db.tools?.python;
  return [
    running.length
      ? `<span class="chip run"><i class="dot"></i><span class="num">${{ speech: '配音', music: '音乐', score: '编曲', clone: '克隆' }[running[0].type] || ''} ${esc(running[0].message || '进行中')}${running.length > 1 ? ` 等 ${running.length} 个任务` : ''}</span></span>`
      : '',
    chip('MiniMax', state.db.settings.minimax, state.db.settings.minimax ? '已保存 Key' : '没有 Key'),
    chip(
      'ElevenLabs',
      state.db.settings.elevenlabs,
      state.db.settings.elevenlabs ? '已保存 Key' : '没有 Key'
    ),
    chip('ffmpeg', ffmpeg, ffmpeg ? '已就绪' : ffmpeg === false ? '没有找到 ffmpeg / ffprobe' : '正在检查'),
    chip(
      'Python',
      python,
      python || (python === false ? '没有找到装了 numpy 和 scipy 的 Python' : '正在检查')
    ),
  ].join('');
}
function headingMeta(p, d) {
  if (p.kind !== 'speech') {
    const n = state.db.versions.filter(v => v.projectId === p.id).length;
    return `${n} 个版本`;
  }
  const parts = [];
  if (d.mode === 'split') {
    const chosen = d.segments.filter(s => takeStatus(s).chosen).length;
    parts.push(`${d.segments.length} 段`, `已选定 ${chosen} 段`);
  } else parts.push('整篇', takeStatus(null).chosen ? '已选定' : '还没有选定版本');
  if (d.source) parts.push(`来自 ${d.source.dir.split('/').pop()}/${d.source.group}_*.txt`);
  return parts.map(esc).join(' · ');
}
function headingHTML(p) {
  const d = draft(),
    speech = p.kind === 'speech';
  return markup`<div class="heading">
    <div class="heading-main">
      <input class="title-input" aria-label="项目名称" id="project-title" value="${esc(p.title)}">
      <p class="num">${headingMeta(p, d)}</p>
    </div>
    <div class="row wrap">
      ${speech ? '<button class="btn small ghost" data-action="import-scripts">导入克隆稿</button>' : ''}
      ${d.source ? '<button class="btn small ghost" data-action="reload-scripts">重新读取稿件</button>' : ''}
      ${speech ? `<button class="btn small ghost" data-action="export-chosen">${icon('download')}导出选定版本</button>` : ''}
      <button class="btn small ghost" data-action="new">${icon('plus')}新项目</button>
      <button class="btn small ghost danger" data-action="delete-project">删除项目</button>
    </div>
  </div>`;
}
function render() {
  const p = project();
  const work = ['speech', 'music', 'score'].includes(state.view);
  $('#app').innerHTML = markup`<div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <b>Harmonis<small>声间 · Voice & music</small></b>
      </div>
      <nav class="nav">${VIEWS.map(
        ([v, i, t, s]) =>
          `<button data-action="nav" data-view="${v}" class="${state.view === v ? 'active' : ''}" ${state.view === v ? 'aria-current="page"' : ''}>${icon(i)}<span>${t}${s ? `<small>${s}</small>` : ''}</span></button>`
      ).join('')}</nav>
      <div class="recent">
        <p class="side-label">项目</p>${state.db.projects
          .slice(0, 12)
          .map(
            p =>
              `<button class="project-link ${p.id === state.projectId ? 'active' : ''}" data-action="project" data-id="${p.id}" title="${esc(p.title)}">${{ music: '♫', score: '♩' }[p.kind] || '•'} ${esc(p.title)}</button>`
          )
          .join('')}
      </div>
      <div class="side-foot">
        <div class="console-links" aria-label="官方控制台">
          <a href="${serviceLinks.minimax.console}" target="_blank" rel="noopener noreferrer">MiniMax 控制台 ↗</a>
          <a href="${serviceLinks.elevenlabs.console}" target="_blank" rel="noopener noreferrer">ElevenLabs 控制台 ↗</a>
        </div>
        <span>本机保存，模型通过 API 调用</span>
      </div>
    </aside>
    <main class="main view-${state.view}">
      <header class="topbar">
        <span class="crumb">${viewName(state.view)}${work ? ` <span class="muted">/</span> ${esc(p.title)}` : ''}</span>
        <div class="top-actions"><span class="status" id="status">${statusHTML()}</span><button class="btn small ghost" data-action="task-history">任务记录</button></div>
      </header>${
        work
          ? markup`${headingHTML(p)}
            <div id="tasks" class="tasks">${taskHTML()}</div>
            ${state.view === 'speech' ? speechHTML() : state.view === 'score' ? scoreHTML() : musicHTML()}`
          : state.view === 'voices'
            ? voicesHTML()
            : state.view === 'settings'
              ? settingsHTML()
              : libraryHTML()
      }
    </main>
  </div>
  <footer id="player" class="player">${playerHTML()}</footer>`;
  bindInputs();
  drawWaves().catch(() => {});
}
function showOverride(key) {
  const el = $(`[data-override="${key}"]`);
  if (el) el.innerHTML = overrideInner(key);
}
function bindInputs() {
  $('#project-title')?.addEventListener('input', e => {
    project().title = e.target.value;
    scheduleSave();
  });
  $('#script')?.addEventListener('input', e => {
    const d = draft(),
      text = e.target.value;
    if (d.mode === 'split') {
      const segments = structuredClone(d.segments);
      segments[state.activeSegment].text = text;
      updateDraft({ segments });
    } else updateDraft({ text });
    // 只更新字数、段落标签和「稿已改」提示，不整页重画，免得打断输入
    const t = takeStatus(currentSegment());
    $('#char-count').textContent = countText(text);
    $('#stale-note').hidden = !t.stale;
    const seg = $(`.seg[data-index="${state.activeSegment}"]`);
    if (seg) {
      seg.querySelector('.seg-meta').textContent = segMeta(text);
      seg.querySelector('.tag').outerHTML = tagHTML(t);
    }
  });
  $$('[data-param]').forEach(el =>
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', e => {
      let value = el.type === 'number' ? Number(el.value) : el.value;
      updateParam(el.dataset.param, value);
      showOverride(el.dataset.param);
      if (el.dataset.param === 'speed' && $('#speed-range')) $('#speed-range').value = value;
      if (el.dataset.param === 'model') {
        const i = speechInput();
        if (!i.model.startsWith('speech-2.6') && ['whisper', 'fluent'].includes(i.emotion)) {
          updateParam('emotion', 'auto');
          toast('当前模型不支持原情绪，已明确切回自动；尚未生成。');
        }
        render();
      }
    })
  );
  $('#speed-range')?.addEventListener('input', e => {
    updateParam('speed', Number(e.target.value));
    showOverride('speed');
    $('#speed').value = e.target.value;
  });
  $('#music-prompt')?.addEventListener('input', e => updateDraft({ prompt: e.target.value }));
  $$('[data-music]').forEach(el =>
    el.addEventListener(el.type === 'number' ? 'input' : 'change', () => {
      updateDraft({
        [el.dataset.music]:
          el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value,
      });
      if ($('#music-cost')) $('#music-cost').textContent = musicCost();
    })
  );
  $$('[data-score]').forEach(el =>
    el.addEventListener(['checkbox', 'select-one'].includes(el.type) ? 'change' : 'input', () => {
      const key = el.dataset.score;
      updateDraft({
        [key]:
          el.type === 'checkbox'
            ? el.checked
            : el.type === 'number'
              ? el.value === ''
                ? null
                : Number(el.value)
              : el.value,
      });
      if (key === 'score') return render();
      if (key === 'plucks') $('#pluck-count').textContent = pluckCount(el.value);
      $('#score-note').textContent = scoreNote();
    })
  );
  $$('[data-chunk]').forEach(el =>
    el.addEventListener('input', () => {
      const chunks = structuredClone(draft().chunks);
      chunks[Number(el.dataset.chunk)][el.dataset.key] = el.type === 'number' ? Number(el.value) : el.value;
      updateDraft({ chunks });
      if ($('#music-cost')) $('#music-cost').textContent = musicCost();
    })
  );
  $$('[data-version-check]').forEach(el =>
    el.addEventListener('change', () =>
      el.checked
        ? state.selected.add(el.dataset.versionCheck)
        : state.selected.delete(el.dataset.versionCheck)
    )
  );
  if (state.view === 'settings')
    api('/api/health')
      .then(h => {
        if ($('#audio-tools'))
          $('#audio-tools').textContent = h.audioTools
            ? 'ffmpeg / ffprobe 已就绪。'
            : '未找到 ffmpeg / ffprobe，请安装后重新启动。';
      })
      .catch(showError);
}

export { render, bindInputs, statusHTML };
