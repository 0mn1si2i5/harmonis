import { $, esc } from './util.js';
import { state } from './state.js';
import { setRenderer, render } from './ui.js';
import { action } from './actions.js';
import { dialogError } from './modal.js';
import { showError, api, toast } from './api.js';
import { flushSave, project, currentVersions } from './draft.js';
import { taskHTML, refreshTaskNotices } from './views/tasks.js';
import { render as renderPage, statusHTML } from './render.js';
$('#modal').addEventListener('close', () => {
  state.recorder?.stop();
  if (state.pendingRender) {
    state.pendingRender = false;
    render();
  }
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  el.disabled = true;
  try {
    await action(el);
  } catch (error) {
    if ($('#modal').open) dialogError(error);
    else showError(error);
  } finally {
    if (el.isConnected) {
      el.disabled = false;
      if (el.dataset.action === 'record-start')
        el.disabled = !!state.recorder?.media && state.recorder.media.state !== 'inactive';
      if (el.dataset.action === 'submit-clone')
        el.disabled = !state.cloneUpload || state.cloneBusy || state.uploadCount > 0;
    }
  }
});
async function poll() {
  if (state.polling || !state.db) return;
  refreshTaskNotices();
  state.polling = true;
  try {
    if (!state.db.jobs.some(j => ['queued', 'running'].includes(j.status))) return;
    const incoming = await api('/api/state');
    const changed = incoming.jobs.some(
      j =>
        ['done', 'failed', 'interrupted'].includes(j.status) &&
        state.db.jobs.find(old => old.id === j.id && ['running', 'queued'].includes(old.status))
    );
    state.db.jobs = incoming.jobs;
    state.db.voices = incoming.voices;
    state.db.versions = incoming.versions;
    if (changed) {
      if (!$('#modal').open) {
        await flushSave();
        const latest = incoming.versions.find(v => v.projectId === state.projectId);
        if (latest) state.currentVersion = latest.id;
        render();
      } else state.pendingRender = true;
      toast('任务状态已更新，成功结果已保存在本机。');
    } else {
      if ($('#tasks')) $('#tasks').innerHTML = taskHTML();
      if ($('#status')) $('#status').innerHTML = statusHTML();
    }
  } catch (e) {
    toast('暂时无法连接本机服务。草稿仍在页面中，请不要关闭。');
  } finally {
    state.polling = false;
  }
}
async function boot() {
  try {
    state.db = await api('/api/state');
    if (!state.db.projects.length) {
      const p = await api('/api/projects', 'POST', { kind: 'speech', title: '第一条配音' });
      state.db.projects.push(p);
    }
    if (!project()) state.projectId = state.db.projects[0].id;
    state.view = project().kind;
    state.currentVersion = currentVersions()[0]?.id || null;
    render();
    setInterval(poll, 2000);
  } catch (e) {
    $('#app').innerHTML = `<div class="boot">${esc(e.message)}<br>请退出并重新打开 Harmonis。</div>`;
  }
}
window.addEventListener('beforeunload', () => {
  state.recorder?.cleanup();
  if (project()) {
    fetch('/api/projects/' + state.projectId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shengjian': '1' },
      body: JSON.stringify({ title: project().title, draft: project().draft }),
      keepalive: true,
    }).catch(() => {});
  }
});
window.harmonisDesktop?.onBeforeQuit(async () => {
  await flushSave();
  state.recorder?.cleanup();
});
setRenderer(renderPage);
boot();
