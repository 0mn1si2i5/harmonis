import { state } from './state.js';
import { api, toast } from './api.js';
import { openModal, closeModal } from './modal.js';
import { markup, esc, $, $$ } from './util.js';
import { render } from './ui.js';
import { flushSave } from './draft.js';

// 克隆稿文件夹：记住上次的路径，方便下次直接读取
const LAST_DIR = 'sj-script-dir';
function lastDir() {
  try {
    return localStorage.getItem(LAST_DIR) || '';
  } catch {
    return '';
  }
}
function openImport() {
  state.scriptPreview = null;
  openModal(
    '导入克隆稿',
    markup`<p class="subtle">读文件夹里的 .txt，一个文件一段，段名用文件名。文件名下划线前面相同的分成一个项目。同一文件夹里的「读音词典.txt」可以写进项目的读音词典。</p>
    <label class="field"><span>文件夹</span>
      <input id="script-dir" class="mono" spellcheck="false" autocomplete="off" placeholder="~/Projects/…/声音克隆稿" value="${esc(lastDir())}">
    </label>
    ${window.harmonisDesktop ? '<button class="btn wide ghost" data-action="select-script-folder">选择文件夹…</button>' : ''}
    <button class="btn wide" data-action="script-preview">读取文件夹</button>
    <div id="script-preview"></div>`
  );
  $('#script-dir').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('[data-action="script-preview"]').click();
  });
}
function importLabel() {
  const n = $$('[data-group]').filter(el => el.checked).length;
  const button = $('[data-action="script-import"]');
  if (!button) return;
  button.textContent = n ? `导入为 ${n} 个项目` : '请至少选一组';
  button.disabled = !n;
}
async function previewScripts() {
  const dir = $('#script-dir').value;
  const r = await api('/api/scripts/preview', 'POST', { dir });
  try {
    localStorage.setItem(LAST_DIR, dir);
  } catch {}
  state.scriptPreview = r;
  $('#script-preview').innerHTML = markup`<p class="subtle">项目名用上一级文件夹：${esc(r.title)}</p>
    <div class="list num">${r.groups
      .map(
        g => markup`<label class="check">
          <input type="checkbox" data-group="${esc(g.name)}" checked><span>${esc(g.name)}</span>
          <span class="muted">${g.segments} 段 · 约 ${Math.round(g.chars / 4)} 秒</span>
        </label>`
      )
      .join('')}</div>
    ${
      r.dictionary
        ? `<label class="check"><input type="checkbox" id="script-dict" checked><span>把读音词典.txt 里的 ${r.dictionary} 条规则写进项目</span></label>`
        : '<p class="subtle">文件夹里没有读音词典.txt。</p>'
    }
    <p class="subtle">以后改了稿件，在项目里点「重新读取稿件」：按段名更新文字，新文件加在后面，已生成的版本都保留。</p>
    <button class="btn primary wide" data-action="script-import">导入</button>`;
  $$('[data-group]').forEach(el => el.addEventListener('change', importLabel));
  importLabel();
}
async function importScripts() {
  const groups = $$('[data-group]')
    .filter(el => el.checked)
    .map(el => el.dataset.group);
  const r = await api('/api/scripts/import', 'POST', {
    dir: state.scriptPreview.dir,
    groups,
    dictionary: !!$('#script-dict')?.checked,
  });
  await flushSave();
  state.db.projects.unshift(...r.projects);
  state.projectId = r.projects[0].id;
  state.view = 'speech';
  state.activeSegment = 0;
  state.currentVersion = null;
  state.selected.clear();
  localStorage.setItem('sj-project', state.projectId);
  closeModal();
  render();
  toast(`已导入 ${r.projects.length} 个项目：${r.projects.map(p => p.title).join('、')}`);
}
async function reloadScripts() {
  if (!confirm('按文件夹里的稿件更新这个项目？在这里改过的段落文字会换成文件里的内容，已生成的版本都保留。'))
    return;
  await flushSave();
  const r = await api('/api/scripts/reload', 'POST', { projectId: state.projectId });
  const i = state.db.projects.findIndex(p => p.id === r.project.id);
  state.db.projects[i] = r.project;
  render();
  const parts = [];
  if (r.changed.length) parts.push(`更新了 ${r.changed.join('、')}`);
  if (r.added.length) parts.push(`新增了 ${r.added.join('、')}`);
  toast(parts.length ? parts.join('；') + '。' : '稿件没有变化。');
}

export { openImport, previewScripts, importScripts, reloadScripts };
