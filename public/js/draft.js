import { state } from './state.js';
import { musicDefaults, speechDefaults, scoreDefaults } from './constants.js';
import { $ } from './util.js';
import { showError, api } from './api.js';
function project() {
  return state.db?.projects.find(p => p.id === state.projectId);
}
function draft() {
  const p = project();
  const defaults = { speech: speechDefaults, music: musicDefaults, score: scoreDefaults }[p?.kind];
  return p ? { ...defaults, ...p.draft } : null;
}
function speechInput() {
  const d = draft();
  if (d.mode === 'split') {
    const s = d.segments[state.activeSegment];
    const { pronunciation, ...settings } = s?.settings || {};
    return { ...d, ...settings, text: s?.text || '', segmentId: s?.id, segmentName: s?.name };
  }
  return d;
}
function updateDraft(update) {
  const p = project();
  p.draft = { ...draft(), ...update };
  scheduleSave();
}
// 读音词典整个项目共用；其余参数在分段模式下只改当前段
const PROJECT_ONLY = ['pronunciation'];
function updateParam(key, value) {
  const d = draft();
  if (state.view === 'speech' && d.mode === 'split' && !PROJECT_ONLY.includes(key)) {
    const segments = structuredClone(d.segments);
    segments[state.activeSegment].settings = { ...segments[state.activeSegment].settings, [key]: value };
    updateDraft({ segments });
  } else updateDraft({ [key]: value });
}
function scheduleSave() {
  clearTimeout(state.saveTimer);
  if ($('#save-state')) $('#save-state').textContent = '保存中…';
  state.saveTimer = setTimeout(() => flushSave().catch(showError), 500);
}
async function flushSave() {
  clearTimeout(state.saveTimer);
  const p = project();
  if (!p) return;
  const snapshot = { title: p.title, draft: structuredClone(p.draft) };
  const pid = p.id;
  state.saveChain = state.saveChain.catch(() => {}).then(() => api('/api/projects/' + pid, 'PUT', snapshot));
  await state.saveChain;
  if ($('#save-state')) $('#save-state').textContent = '已保存到本机';
}
function resetParam(key) {
  const d = draft();
  const segments = structuredClone(d.segments);
  delete segments[state.activeSegment].settings[key];
  updateDraft({ segments });
}
function currentSegment() {
  const d = draft();
  return d?.mode === 'split' ? d.segments[state.activeSegment] : null;
}
function currentVersions() {
  return state.db.versions.filter(v => v.projectId === state.projectId);
}
// 版本归属：分段模式按段落 id，整篇模式只看没有段落 id 的版本
function versionsFor(segment) {
  return currentVersions().filter(v => (segment ? v.input?.segmentId === segment.id : !v.input?.segmentId));
}
// 段落（或整篇）的状态：有几版、选定了哪版、选定那版念的是不是旧稿
function takeStatus(segment) {
  const d = draft();
  const versions = versionsFor(segment);
  const chosenId = segment ? segment.chosen : d.chosen;
  const chosen = versions.find(v => v.id === chosenId) || null;
  const text = segment ? segment.text : d.text;
  return { versions, chosen, stale: !!chosen && chosen.input.text !== text };
}
function setChosen(versionId) {
  const d = draft();
  if (d.mode === 'split') {
    const segments = structuredClone(d.segments);
    const s = segments[state.activeSegment];
    s.chosen = s.chosen === versionId ? null : versionId;
    updateDraft({ segments });
  } else updateDraft({ chosen: d.chosen === versionId ? null : versionId });
}
// 稿件约每秒 4 个字；只数汉字
const hanCount = text => (String(text || '').match(/[\u4e00-\u9fff]/g) || []).length;
const estimateSeconds = text => hanCount(text) / 4;

export {
  project,
  draft,
  speechInput,
  updateDraft,
  updateParam,
  resetParam,
  scheduleSave,
  flushSave,
  currentVersions,
  currentSegment,
  versionsFor,
  takeStatus,
  setChosen,
  hanCount,
  estimateSeconds,
};
