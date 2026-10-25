import { flushSave, currentVersions } from './draft.js';
import { state } from './state.js';
import { api } from './api.js';
import { render } from './ui.js';
async function refresh(renderPage = true) {
  await flushSave();
  state.db = await api('/api/state');
  if (renderPage) render();
}
async function newProject(kind) {
  await flushSave();
  const title = { speech: '新的配音', music: '新的配乐', score: '新的编曲' }[kind];
  const p = await api('/api/projects', 'POST', { kind, title });
  state.db.projects.unshift(p);
  state.projectId = p.id;
  state.view = kind;
  state.activeSegment = 0;
  state.currentVersion = null;
  state.selected.clear();
  localStorage.setItem('sj-project', state.projectId);
  render();
}
async function selectProject(pid) {
  await flushSave();
  const p = state.db.projects.find(p => p.id === pid);
  if (!p) return;
  state.projectId = pid;
  state.view = p.kind;
  state.activeSegment = 0;
  state.currentVersion = currentVersions()[0]?.id || null;
  state.selected.clear();
  localStorage.setItem('sj-project', pid);
  render();
}
async function navigate(v) {
  await flushSave();
  state.view = v;
  if (['speech', 'music', 'score'].includes(v)) {
    const p = state.db.projects.find(p => p.kind === v);
    if (!p) return newProject(v);
    state.projectId = p.id;
    state.currentVersion = currentVersions()[0]?.id || null;
    state.activeSegment = 0;
    state.selected.clear();
    localStorage.setItem('sj-project', state.projectId);
  }
  render();
}

export { refresh, newProject, selectProject, navigate };
