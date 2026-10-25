export const SUCCESS_NOTICE_MS = 8000;
const time = job => Date.parse(job.updatedAt || job.createdAt) || 0;
const scope = job => `${job.provider}:${job.type}:${job.projectId || ''}`;
export function visibleTasks(jobs, { projectId, view, dismissed = [], now = Date.now() }) {
  const hidden = new Set(dismissed);
  return jobs.filter(job => {
    if (!(view === 'voices' ? job.type === 'clone' : job.projectId === projectId || job.type === 'clone'))
      return false;
    if (['queued', 'running'].includes(job.status)) return true;
    if (hidden.has(job.id)) return false;
    if (job.status === 'done') return now - time(job) < SUCCESS_NOTICE_MS;
    // A later successful attempt resolves the earlier error in this workflow.
    return !jobs.some(next => next.status === 'done' && scope(next) === scope(job) && time(next) > time(job));
  });
}
export function readDismissed(storage) {
  try {
    const ids = JSON.parse(storage.getItem('sj-dismissed-tasks') || '[]');
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export function dismissTask(storage, id) {
  const ids = [...new Set([...readDismissed(storage), id])];
  storage.setItem('sj-dismissed-tasks', JSON.stringify(ids));
}
