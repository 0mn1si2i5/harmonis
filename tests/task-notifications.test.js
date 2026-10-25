import test from 'node:test';
import assert from 'node:assert/strict';
import {
  visibleTasks,
  dismissTask,
  readDismissed,
  SUCCESS_NOTICE_MS,
} from '../public/js/task-notifications.js';
const now = Date.parse('2026-10-24T11:00:00Z');
const job = (id, status, ago, extra = {}) => ({
  id,
  status,
  type: 'clone',
  provider: 'minimax',
  projectId: null,
  updatedAt: new Date(now - ago).toISOString(),
  ...extra,
});
const context = { now, projectId: 'project', view: 'voices' };
test('successful tasks expire while active jobs remain visible', () => {
  const jobs = [
    job('recent', 'done', 1000),
    job('old', 'done', SUCCESS_NOTICE_MS),
    job('live', 'running', 60000),
  ];
  assert.deepEqual(
    visibleTasks(jobs, context).map(j => j.id),
    ['recent', 'live']
  );
});
test('a successful retry clears obsolete errors without deleting their records', () => {
  const jobs = [
    job('ok', 'done', 20000),
    job('failed', 'failed', 30000),
    job('other', 'failed', 30000, { provider: 'other' }),
  ];
  assert.deepEqual(
    visibleTasks(jobs, context).map(j => j.id),
    ['other']
  );
  assert.equal(jobs.length, 3);
});
test('dismissal survives a reload and never hides an active task', () => {
  const data = new Map(),
    storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  dismissTask(storage, 'bad');
  dismissTask(storage, 'live');
  assert.deepEqual(
    visibleTasks([job('bad', 'failed', 1000), job('live', 'running', 1000)], {
      ...context,
      dismissed: readDismissed(storage),
    }).map(j => j.id),
    ['live']
  );
});
test('one project success does not silence another project failure', () => {
  const jobs = [
    job('ok', 'done', 1000, { type: 'speech', projectId: 'a' }),
    job('bad', 'failed', 2000, { type: 'speech', projectId: 'b' }),
  ];
  assert.deepEqual(
    visibleTasks(jobs, { ...context, view: 'speech', projectId: 'b' }).map(j => j.id),
    ['bad']
  );
});
