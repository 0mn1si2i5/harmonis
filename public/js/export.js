import { state } from './state.js';
import { api } from './api.js';
import { openModal, closeModal } from './modal.js';
import { markup, esc, $ } from './util.js';
import { draft, project, takeStatus, flushSave } from './draft.js';
import { versionTitle } from './views/versions.js';

// 配音项目：按段落顺序导出各段选定的那一版，文件名用段名
function openExportChosen() {
  const d = draft(),
    p = project();
  const rows =
    d.mode === 'split'
      ? d.segments.map((s, n) => ({ name: s.name || `${p.title}_段${n + 1}`, ...takeStatus(s) }))
      : [{ name: p.title, ...takeStatus(null) }];
  const picked = rows.filter(r => r.chosen);
  if (!picked.length) throw new Error('还没有选定版本。在版本列表里点「选定」。');
  const list = rows
    .map(r =>
      r.chosen
        ? `<div><span>${esc(r.name)}</span>${r.stale ? '<span class="warn">稿已改，念的是旧稿</span>' : `<span>${r.chosen.duration.toFixed(1)} 秒</span>`}</div>`
        : `<div class="skip"><span>${esc(r.name)}</span><span>未选定，跳过</span></div>`
    )
    .join('');
  openExport(
    `${rows.length} 段里选定了 ${picked.length} 段`,
    list,
    picked.map(r => ({ id: r.chosen.id, name: r.name }))
  );
}
// 音乐页和作品库：导出勾选的版本，文件名由服务端按段名或项目名起
function openExportSelected() {
  const versions = [...state.selected].map(id => state.db.versions.find(v => v.id === id)).filter(Boolean);
  if (!versions.length) throw new Error('请先勾选需要导出的版本');
  const list = versions
    .map(v => `<div><span>${esc(versionTitle(v))}</span><span>${v.duration.toFixed(1)} 秒</span></div>`)
    .join('');
  openExport(
    `已勾选 ${versions.length} 个版本`,
    list,
    versions.map(v => ({ id: v.id }))
  );
}
function openExport(summary, list, items) {
  state.exportItems = items;
  const subtitles = items.some(i => state.db.versions.find(v => v.id === i.id)?.subtitles);
  openModal(
    '导出',
    markup`<p class="subtle num">${summary}</p>
    <div class="list num">${list}</div>
    <label class="field"><span>导出方式</span>
      <select id="export-mode">
        <option value="zip">ZIP · 每段一个文件</option>
        <option value="merge">按顺序合并成一条</option>
      </select>
    </label>
    <label class="field"><span>格式</span>
      <select id="export-format"><option value="wav">WAV</option><option value="mp3">MP3</option></select>
    </label>
    <label class="check"><input type="checkbox" id="export-loudness" checked><span>响度统一到 <span class="num">-16 LUFS</span>，峰值不超过 <span class="num">-1 dBTP</span></span></label>
    <label class="check"><input type="checkbox" id="export-trim" checked><span>去掉首尾静音，各留 <span class="num">0.1</span> 秒</span></label>
    <label class="check"><input type="checkbox" id="export-48k" checked><span>采样率 <span class="num">48 kHz</span></span></label>
    <label class="check"><input type="checkbox" id="export-srt" ${subtitles ? '' : 'disabled'}><span>附带字幕 SRT（按 MiniMax 返回的句子时间）${subtitles ? '' : '。这些版本没有字幕数据'}</span></label>
    <button class="btn primary wide" data-action="do-export">导出并下载</button>
    <div id="export-result"></div>`
  );
}
function download(url) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
}
async function doExport() {
  await flushSave();
  const items = state.exportItems;
  const result = await api('/api/export', 'POST', {
    versionIds: items.map(i => i.id),
    names: items.map(i => i.name || null),
    mode: $('#export-mode').value,
    format: $('#export-format').value,
    process: {
      trim: $('#export-trim').checked,
      loudness: $('#export-loudness').checked,
      sampleRate48: $('#export-48k').checked,
    },
    srt: $('#export-srt').checked,
    title: project()?.title || 'Harmonis导出',
  });
  download(result.url);
  // 合并模式的字幕是单独一个文件，留在弹窗里让人点
  if (result.srt)
    $('#export-result').innerHTML =
      `<p class="notice">音频已开始下载。<a href="${result.srt}" download>下载字幕 SRT</a></p>`;
  else closeModal();
}

export { openExportChosen, openExportSelected, doExport };
