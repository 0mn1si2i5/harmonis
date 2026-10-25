import { state } from './state.js';
import { api, toast } from './api.js';
import { flushSave } from './draft.js';
import { render } from './ui.js';
import { openModal, closeModal } from './modal.js';
import { $, esc, date, fmtTime } from './util.js';
import { taskHistoryHTML } from './views/tasks.js';

const cancel = '<button class="btn ghost" data-action="close">取消</button>';
function openVoiceDeletion(id) {
  const v = state.db.voices.find(v => v.id === id);
  if (!v) throw new Error('找不到这个音色');
  const affected = state.db.projects.filter(
    p => p.draft?.voiceId === v.voiceId || p.draft?.segments?.some(s => s.settings?.voiceId === v.voiceId)
  ).length;
  openModal(
    '删除音色',
    `
    <p>删除「${esc(v.name)}」</p>
    <label class="field"><span>删除范围</span><select id="voice-delete-scope">
      <option value="local">仅从Harmonis移除</option>
      <option value="provider">同时删除 MiniMax 音色</option>
    </select></label>
    <p class="subtle">仅从Harmonis移除：保留云端音色，以后可以重新导入。</p>
    <p class="subtle">同时删除 MiniMax 音色：使用当前 Key 调用云端删除，原音色 ID 将不能再用于生成。</p>
    <p class="subtle spaced">已有配音和原始录音都会保留。${affected ? `有 ${affected} 个项目使用此音色，删除后需要重新选择音色。` : ''}</p>
    <div class="row dialog-actions">${cancel}<button class="btn danger" data-action="confirm-delete-voice" data-id="${esc(id)}">确认删除</button></div>`
  );
}
function recordingsHTML() {
  return `<p class="subtle">保存在这台 Mac 的克隆录音与参考音频。删除录音不会删除已建立的音色或配音。</p>
    <div class="recording-list">${
      state.db.uploads
        .map(
          u => `<article class="recording-item">
      <div class="row between"><div><strong>${esc(u.name)}</strong><p class="subtle">${u.reference ? '参考音频' : '克隆录音'} · ${fmtTime(u.duration)} · ${date(u.createdAt)}</p></div>
      <button class="btn small ghost danger" data-action="delete-upload" data-id="${esc(u.id)}" aria-label="删除录音 ${esc(u.name)}">删除</button></div>
      <audio controls preload="none" src="/api/uploads/${encodeURIComponent(u.id)}/audio" aria-label="试听 ${esc(u.name)}"></audio>
    </article>`
        )
        .join('') || '<div class="empty">没有保存的录音。</div>'
    }</div>`;
}
async function reload() {
  // 删除音色会改变草稿引用，直接读取删除后的状态，避免旧草稿覆盖服务端清理。
  state.db = await api('/api/state');
  render();
}
async function manageAction(el) {
  const a = el.dataset.action,
    id = el.dataset.id;
  if (a === 'delete-voice') return openVoiceDeletion(id);
  if (a === 'confirm-delete-voice') {
    const scope = $('#voice-delete-scope').value;
    await flushSave();
    await api('/api/voices/' + id, 'DELETE', { scope });
    closeModal();
    await reload();
    return toast(
      scope === 'provider'
        ? '已删除 MiniMax 音色并移除本机记录。已有配音仍保留。'
        : '已从Harmonis移除音色，云端音色和已有配音仍保留。'
    );
  }
  if (a === 'manage-recordings') return openModal('录音管理', recordingsHTML());
  if (a === 'delete-upload') {
    const u = state.db.uploads.find(u => u.id === id);
    if (!u) throw new Error('找不到录音');
    return openModal(
      '删除录音',
      `<p>删除「${esc(u.name)}」？</p><p class="subtle spaced">本机音频文件将永久删除，不能恢复。已建立的音色和生成的配音不受影响。</p><div class="row dialog-actions"><button class="btn ghost" data-action="manage-recordings">取消</button><button class="btn danger" data-action="confirm-delete-upload" data-id="${esc(id)}">删除录音文件</button></div>`
    );
  }
  if (a === 'confirm-delete-upload') {
    await flushSave();
    await api('/api/uploads/' + id, 'DELETE');
    if (state.cloneUpload?.id === id) state.cloneUpload = null;
    if (state.refUpload?.id === id) state.refUpload = null;
    await reload();
    openModal('录音管理', recordingsHTML());
    return toast('录音文件已删除。');
  }
  if (a === 'remove-key') {
    const provider = el.dataset.provider,
      name = provider === 'minimax' ? 'MiniMax' : 'ElevenLabs';
    return openModal(
      '移除本机密钥',
      `<p>移除Harmonis保存的 ${name} API Key？</p><p class="subtle spaced">之后需要重新填写才能调用此服务。此操作不会注销供应商账户，也不会撤销云端 Key。</p><div class="row dialog-actions">${cancel}<button class="btn danger" data-action="confirm-remove-key" data-provider="${provider}">移除密钥</button></div>`
    );
  }
  if (a === 'confirm-remove-key') {
    await flushSave();
    await api('/api/settings/' + el.dataset.provider, 'DELETE');
    closeModal();
    await reload();
    return toast('本机保存的密钥已移除。');
  }
  if (a === 'clear-task-history') {
    return openModal(
      '清理任务记录',
      `<p>清理所有已结束的任务记录？</p><p class="subtle spaced">包括成功、失败和中断记录，清理后不能恢复。音色、录音和生成作品都会保留，进行中的任务不会清理。</p><div class="row dialog-actions"><button class="btn ghost" data-action="task-history">取消</button><button class="btn danger" data-action="confirm-clear-tasks">清理已结束记录</button></div>`
    );
  }
  if (a === 'confirm-clear-tasks') {
    await flushSave();
    const result = await api('/api/jobs', 'DELETE');
    localStorage.removeItem('sj-dismissed-tasks');
    await reload();
    openModal('任务记录', taskHistoryHTML());
    return toast(`已清理 ${result.deleted} 条记录，作品仍然保留。`);
  }
}
export const managementActions = new Set([
  'delete-voice',
  'confirm-delete-voice',
  'manage-recordings',
  'delete-upload',
  'confirm-delete-upload',
  'remove-key',
  'confirm-remove-key',
  'clear-task-history',
  'confirm-clear-tasks',
]);
export { manageAction };
