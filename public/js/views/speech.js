import { draft, speechInput, takeStatus, hanCount, estimateSeconds, versionsFor } from '../draft.js';
import { state } from '../state.js';
import { markup, esc, options, icon } from '../util.js';
import { labels } from '../constants.js';
import { takesHTML } from './versions.js';

const seconds = s => s.toFixed(1);
const countText = text => `${hanCount(text)} 字 · 估计 ${seconds(estimateSeconds(text))} 秒（每秒 4 字）`;
const segMeta = text => `${hanCount(text)} 字 · 约 ${seconds(estimateSeconds(text))} 秒`;
// 段落标签：稿已改 > 已选定 > n 版 > 未生成
function tagHTML(t) {
  if (t.stale) return '<span class="tag stale">稿已改</span>';
  if (t.chosen) return '<span class="tag done">已选定</span>';
  if (t.versions.length) return `<span class="tag some">${t.versions.length} 版</span>`;
  return '<span class="tag none">未生成</span>';
}
function railHTML(d) {
  const total = d.segments.reduce((n, s) => n + estimateSeconds(s.text), 0);
  return markup`<aside class="rail" aria-label="段落">
    <div class="rail-head"><span>段落</span><span class="num">共约 ${Math.round(total)} 秒</span></div>
    ${d.segments
      .map((s, n) => {
        const t = takeStatus(s);
        return markup`<button class="seg ${state.activeSegment === n ? 'active' : ''}" data-action="segment" data-index="${n}">
          <b>${esc(s.name || '第 ' + (n + 1) + ' 段')}</b>${tagHTML(t)}
          <span class="seg-meta num">${segMeta(s.text)}</span>
        </button>`;
      })
      .join('')}
    <button class="btn small ghost" data-action="add-segment">添加段落</button>
  </aside>`;
}
// 分段模式下，本段单独改过的参数标出来，可以恢复成项目设置
function overrideInner(key) {
  const d = draft();
  if (d.mode !== 'split') return '';
  const s = d.segments[state.activeSegment];
  if (!s?.settings || !(key in s.settings)) return '';
  return `本段单独设置 · <button class="link" data-action="reset-param" data-key="${key}">恢复项目设置</button>`;
}
const overrideHTML = key => `<span class="override" data-override="${key}">${overrideInner(key)}</span>`;
function inspectorHTML(d, i, t) {
  const emotions = [
    'auto',
    ...state.db.capabilities.basicEmotions,
    ...(i.model.startsWith('speech-2.6') ? ['fluent', 'whisper'] : []),
  ];
  const rules = (i.pronunciation || '').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;
  const pending =
    d.mode === 'split' ? d.segments.filter(s => !takeStatus(s).chosen || takeStatus(s).stale).length : 0;
  return markup`<aside class="panel inspector">
    <div class="field">
      <div class="label-row"><label for="voiceId">音色</label>${state.db.voices.length ? '<button class="link" data-action="clone-dialog">建立新音色</button>' : ''}</div>
      ${
        state.db.voices.length
          ? markup`<select id="voiceId" data-param="voiceId">${options(
              ['', ...state.db.voices.map(v => v.voiceId)],
              i.voiceId,
              Object.fromEntries([['', '请选择音色'], ...state.db.voices.map(v => [v.voiceId, v.name])])
            )}</select>`
          : `<button class="voice-setup" data-action="clone-dialog">建立我的音色<small>网页录音或上传已有音频</small></button>`
      }
    </div>
    <div class="field">
      <div class="label-row"><label for="speed">语速</label>${overrideHTML('speed')}</div>
      <div class="row">
        <input id="speed-range" aria-label="语速滑杆" type="range" min="0.5" max="2" step="0.05" value="${i.speed}">
        <input id="speed" class="num" data-param="speed" type="number" min="0.5" max="2" step="0.05" value="${i.speed}" aria-label="语速数值">
      </div>
    </div>
    <div class="field">
      <div class="label-row"><label for="emotion">情绪</label>${overrideHTML('emotion')}</div>
      <select id="emotion" data-param="emotion">${options(emotions, i.emotion, labels)}</select>
    </div>
    <div class="field">
      <div class="label-row"><span>读音词典</span><span class="hint">整个项目共用</span></div>
      <div class="dict"><span class="num">${rules ? rules + ' 条规则' : '还没有规则'}</span>
        <button class="btn small ghost" data-action="pronunciation">编辑</button></div>
    </div>
    <div class="generate-actions">
      <button class="btn primary wide" data-action="generate-speech" data-scope="current">${icon('spark')}生成${d.mode === 'split' ? '本段' : '配音'}</button>
      ${
        d.mode === 'split' && pending && pending < d.segments.length
          ? `<button class="btn ghost wide num" data-action="generate-speech" data-scope="pending">生成未选定或稿已改的 ${pending} 段</button>`
          : ''
      }
      ${
        d.mode === 'split'
          ? `<button class="btn ghost wide num" data-action="generate-speech" data-scope="all">生成全部 ${d.segments.length} 段</button>`
          : ''
      }
    </div>
    <details class="details">
      <summary>高级设置 <span class="muted">${esc(i.model)}</span></summary>
      <div class="field">
        <div class="label-row"><label for="model">MiniMax 模型</label>${overrideHTML('model')}</div>
        <select id="model" data-param="model">${options(state.db.capabilities.speechModels, i.model)}</select>
      </div>
      <div class="field">
        <div class="label-row"><label for="volume">音量 vol</label>${overrideHTML('volume')}</div>
        <input id="volume" class="num" type="number" min="0.01" max="10" step="0.1" value="${i.volume}" data-param="volume">
      </div>
      <div class="field">
        <div class="label-row"><label for="pitch">音调 pitch（-12 到 12）</label>${overrideHTML('pitch')}</div>
        <input id="pitch" class="num" type="number" min="-12" max="12" step="1" value="${i.pitch}" data-param="pitch">
      </div>
      <div class="field">
        <div class="label-row"><label for="normalization">数字与文本规范化</label>${overrideHTML('normalization')}</div>
        <select id="normalization" data-param="normalization">${options(
          ['off', 'basic', 'quality'],
          i.normalization,
          {
            off: '不启用',
            basic: 'basic · 规则处理',
            quality: 'quality · 更准，耗时更长',
          }
        )}</select>
      </div>
      <div class="field">
        <label for="pronunciation">读音规则，一行一条（# 开头是注释）</label>
        <textarea id="pronunciation" class="mono" data-param="pronunciation" rows="6" placeholder="长到/(zhang3)到">${esc(i.pronunciation)}</textarea>
        <small>格式：原词/替换。替换里可以混写汉字和拼音，声调写数字，5 是轻声。</small>
      </div>
    </details>
    <p class="generate-note">每次生成按 MiniMax 账户计费，第一次正式使用克隆音色可能另收音色费。试听已生成的版本不计费。</p>
  </aside>`;
}
function speechHTML() {
  const d = draft(),
    i = speechInput();
  const segment = d.mode === 'split' ? d.segments[state.activeSegment] : null;
  const t = takeStatus(segment);
  return markup`${
    !state.db.settings.minimax
      ? '<div class="notice">生成配音前需要在 <button class="btn small ghost" data-action="nav" data-view="settings">服务设置</button> 填入 MiniMax API Key。文案可以先写。</div>'
      : ''
  }
  <div class="workspace ${d.mode === 'split' ? 'split' : ''}">
    ${d.mode === 'split' ? railHTML(d) : ''}
    <div class="column">
      <section class="panel">
        <div class="panel-head">
          <strong>${d.mode === 'split' ? esc(segment?.name || '第 ' + (state.activeSegment + 1) + ' 段') : '旁白文案'}</strong>
          <div class="segmented">
            <button data-action="mode" data-mode="whole" class="${d.mode === 'whole' ? 'active' : ''}">整篇</button>
            <button data-action="mode" data-mode="split" class="${d.mode === 'split' ? 'active' : ''}">分段</button>
          </div>
        </div>
        <p class="stale-note" id="stale-note" ${t.stale ? '' : 'hidden'}>稿件改过：选定的那一版念的是旧稿，需要重新生成。</p>
        <div class="editor-body">
          <textarea id="script" class="script" aria-label="配音文案" placeholder="写下或粘贴旁白文案。分段模式下空一行就是一段。">${esc(i.text)}</textarea>
        </div>
        <div class="editor-tools">
          <button class="btn small ghost" data-action="pause">插入停顿</button>
          <button class="btn small ghost" data-action="request">查看实际请求</button>
          ${d.mode === 'split' ? `<button class="btn small ghost danger" data-action="remove-segment">删除本段</button>` : ''}
        </div>
        <div class="editor-footer num">
          <span id="char-count">${countText(i.text)}</span>
          <span>${t.chosen ? `选定版本 ${seconds(t.chosen.duration)} 秒` : t.versions.length ? '还没有选定版本' : ''}</span>
          <span class="save-state" id="save-state">已保存</span>
        </div>
      </section>
      ${takesHTML(versionsFor(segment), t.chosen?.id, segment ? '本段版本' : '整篇版本')}
    </div>
    ${inspectorHTML(d, i, t)}
  </div>`;
}

export { speechHTML, tagHTML, segMeta, countText, overrideInner };
