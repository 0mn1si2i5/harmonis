import { serviceLinks } from '../service-links.js';
import { state } from '../state.js';
import { markup, esc, date } from '../util.js';
import { visibleTasks, readDismissed } from '../task-notifications.js';

function taskRow(j, history = false) {
  const active = ['running', 'queued'].includes(j.status);
  const label = { clone: '音色克隆', music: '音乐创作', score: '本机合成' }[j.type] || '配音生成';
  return markup`<div class="task ${esc(j.status)}">
    <div class="task-content">${active ? '<i class="pulse"></i>' : ''}<strong>${label} · ${esc(j.message)}</strong>
    ${history ? `<small class="muted">${date(j.updatedAt || j.createdAt)}</small>` : ''}
    ${j.error ? `<small>${esc(j.error)}</small>` : ''}
    ${j.provider === 'minimax' && /(?:1008|insufficient balance)/i.test(j.error || '') ? `<small>${state.db.settings.minimaxKeyType === 'subscription' ? '当前使用订阅 Key，不会扣按量钱包余额。可在服务设置更换按量 API Key。' : '请核对该 Key 对应账户的可用额度、代金券适用范围及克隆费用。'} <a href="${serviceLinks.minimax.wallet}" target="_blank" rel="noopener noreferrer">查看 MiniMax 钱包 ↗</a></small>` : ''}
    ${j.results?.length ? `<small>已保存 ${j.results.length} 个结果</small>` : ''}</div>
    ${!history && !active ? `<button class="task-close" data-action="dismiss-task" data-id="${esc(j.id)}" aria-label="关闭${label}通知" title="关闭通知">×</button>` : ''}
  </div>`;
}
function taskHTML() {
  return visibleTasks(state.db.jobs, {
    projectId: state.projectId,
    view: state.view,
    dismissed: readDismissed(localStorage),
  })
    .map(j => taskRow(j))
    .join('');
}
function refreshTaskNotices() {
  const el = document.querySelector('#tasks');
  if (!el) return;
  const html = taskHTML();
  if (el.innerHTML !== html) el.innerHTML = html;
}
function taskHistoryHTML() {
  return `<div class="row between"><p class="subtle">通知关闭后，任务和生成结果仍然保留。</p>${state.db.jobs.some(j => !['queued', 'running'].includes(j.status)) ? '<button class="btn small ghost danger" data-action="clear-task-history">清理已结束记录</button>' : ''}</div><div class="task-history">${state.db.jobs.map(j => taskRow(j, true)).join('') || '<div class="empty">还没有任务记录。</div>'}</div>`;
}
export { taskHTML, taskHistoryHTML, refreshTaskNotices };
