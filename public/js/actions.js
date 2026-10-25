import { manageAction, managementActions } from './manage.js';
import { taskHistoryHTML, refreshTaskNotices } from './views/tasks.js';
import { dismissTask } from './task-notifications.js';
import {
  flushSave,
  draft,
  project,
  speechInput,
  updateDraft,
  updateParam,
  resetParam,
  setChosen,
  takeStatus,
} from './draft.js';
import { state } from './state.js';
import { api, toast } from './api.js';
import { render } from './ui.js';
import { openModal, closeModal, dialogError } from './modal.js';
import { esc, markup, $, date, fmtTime } from './util.js';
import { navigate, selectProject, newProject, refresh } from './projects.js';
import { openClone, recordStart, uploadAudio } from './clone.js';
import { playVersion } from './views/versions.js';
import { openImport, previewScripts, importScripts, reloadScripts } from './scripts.js';
import { openExportChosen, openExportSelected, doExport } from './export.js';

const SPEECH_PARAMS = ['model', 'voiceId', 'speed', 'emotion', 'volume', 'pitch', 'normalization'];
// scope：current 当前段，pending 没选定或稿已改的段，all 全部段
async function generateSpeech(scope) {
  await flushSave();
  const d = draft();
  let input = speechInput(),
    sections;
  if (d.mode === 'split') {
    const { segments, source, chosen, ...root } = d;
    input = root;
    let picked = segments.map((s, index) => ({ s, index }));
    if (scope === 'current') picked = [picked[state.activeSegment]];
    else if (scope === 'pending')
      picked = picked.filter(({ s }) => {
        const t = takeStatus(s);
        return !t.chosen || t.stale;
      });
    picked = picked.filter(({ s }) => s.text.trim());
    if (!picked.length) throw new Error(scope === 'current' ? '这一段还没有文字' : '没有需要生成的段落');
    sections = picked.map(({ s, index }) => ({
      text: s.text,
      index,
      settings: s.settings,
      segmentId: s.id,
      name: s.name,
    }));
  }
  const result = await api('/api/speech', 'POST', { projectId: state.projectId, input, sections });
  state.db.jobs.unshift(result);
  toast(
    sections?.length > 1
      ? `已提交 ${sections.length} 段。每段生成完都会留一版，可以继续编辑。`
      : '已提交 MiniMax。生成完会留一版，可以继续编辑。'
  );
  render();
}
async function showRequest() {
  const request = await api(
    state.view === 'music' ? '/api/music/preview' : '/api/speech/preview',
    'POST',
    state.view === 'music' ? draft() : speechInput()
  );
  openModal(
    '本次实际请求',
    `<p class="subtle">不包含 API Key。这里显示将发送给供应商的参数。</p><pre class="json">${esc(JSON.stringify(request.request || request, null, 2))}</pre>`
  );
}
async function action(el) {
  const a = el.dataset.action;
  if (managementActions.has(a)) return manageAction(el);
  if (a === 'task-history') return openModal('任务记录', taskHistoryHTML());
  if (a === 'dismiss-task') {
    const job = state.db.jobs.find(j => j.id === el.dataset.id);
    if (job && !['queued', 'running'].includes(job.status)) dismissTask(localStorage, job.id);
    return refreshTaskNotices();
  }
  if (a === 'select-script-folder') {
    const directory = await window.harmonisDesktop?.selectScriptFolder();
    if (directory) $('#script-dir').value = directory;
    return;
  }
  if (a === 'open-data-folder') return window.harmonisDesktop?.openDataFolder();
  if (a === 'nav') return navigate(el.dataset.view);
  if (a === 'project') return selectProject(el.dataset.id);
  if (a === 'new') return newProject(state.view);
  if (a === 'close') return closeModal();
  if (a === 'clone-dialog') return openClone();
  if (a === 'segment') {
    state.activeSegment = Number(el.dataset.index);
    return render();
  }
  if (a === 'mode') {
    const d = draft(),
      mode = el.dataset.mode;
    if (mode === d.mode) return;
    if (mode === 'split') {
      const segments = d.text
        .split(/\n\s*\n/)
        .filter(t => t.trim())
        .map((text, n) => {
          const old = d.segments[n];
          return old?.text === text ? old : { id: crypto.randomUUID(), text, settings: {} };
        });
      updateDraft({
        mode,
        segments: segments.length ? segments : [{ id: crypto.randomUUID(), text: '', settings: {} }],
      });
      state.activeSegment = 0;
    } else {
      if (
        d.segments.some(s => Object.keys(s.settings || {}).length) &&
        !confirm('切回整篇将使用整篇参数；各段专属参数不用于整篇生成。继续？')
      )
        return;
      updateDraft({ mode, text: d.segments.map(s => s.text).join('\n\n') });
    }
    return render();
  }
  if (a === 'add-segment') {
    const segments = [...draft().segments, { id: crypto.randomUUID(), text: '', settings: {} }];
    updateDraft({ segments });
    state.activeSegment = segments.length - 1;
    render();
    $('#script').focus();
    return;
  }
  if (a === 'remove-segment') {
    const segments = [...draft().segments];
    if (segments.length <= 1) throw new Error('至少保留一个段落');
    if (!confirm('删除当前草稿段落？已生成音频仍会保留。')) return;
    segments.splice(state.activeSegment, 1);
    state.activeSegment = Math.max(0, state.activeSegment - 1);
    updateDraft({ segments });
    return render();
  }
  if (a === 'pause') {
    const area = $('#script'),
      start = area.selectionStart,
      end = area.selectionEnd;
    openModal(
      '插入指定位置的停顿',
      markup`<label class="field">
    <span>停顿秒数（0.01–99.99）
    </span>
    <input id="pause-seconds" type="number" min="0.01" max="99.99" step="0.01" value="0.5">
  </label>
  <p class="subtle">插入到刚才的光标位置。须放在两段可发音文字之间，不能连续插入。
  </p>
  <button class="btn primary wide" id="insert-pause">插入
  </button>`
    );
    $('#insert-pause').onclick = () => {
      const seconds = Number($('#pause-seconds').value);
      if (seconds < 0.01 || seconds > 99.99) return dialogError(new Error('请输入有效的停顿时长'));
      area.setRangeText('<#' + Math.round(seconds * 100) / 100 + '#>', start, end, 'end');
      area.dispatchEvent(new Event('input'));
      closeModal();
      area.focus();
    };
    return;
  }
  if (a === 'pronunciation') {
    const details = $('.inspector details');
    details.open = true;
    $('#pronunciation').focus();
    return;
  }
  if (a === 'request') return showRequest();
  if (a === 'generate-speech') return generateSpeech(el.dataset.scope);
  if (a === 'play') return playVersion(el.dataset.id);
  if (a === 'version-detail') {
    const v = state.db.versions.find(v => v.id === el.dataset.id);
    openModal(
      '生成时的文案与参数',
      markup`<p class="subtle">${date(v.createdAt)} · 时长 ${fmtTime(v.duration)} · 版本 ${v.id.slice(0, 6)}
  </p>
  <pre class="json">${esc(JSON.stringify({ request: v.request, usage: v.usage }, null, 2))}
  </pre>
  <p class="subtle">这份参数属于已生成音频，不受当前草稿修改影响。
  </p>
  <button class="btn wide" data-action="restore" data-id="${v.id}">恢复这版到草稿
  </button>`
    );
    return;
  }
  if (a === 'restore') {
    const v = state.db.versions.find(v => v.id === el.dataset.id);
    if (v.projectId !== state.projectId) await selectProject(v.projectId);
    const d = draft();
    if (v.kind === 'speech' && d.mode === 'split' && v.input.segmentId) {
      // 分段版本恢复回它原来的那一段；段落删掉了就加回末尾
      if (!confirm('用这版的文字和参数替换它所在段落？其他段和生成记录都不变。')) return;
      const segments = structuredClone(d.segments);
      let index = segments.findIndex(s => s.id === v.input.segmentId);
      if (index < 0) {
        segments.push({ id: v.input.segmentId, name: v.input.segmentName, text: '', settings: {} });
        index = segments.length - 1;
      }
      const settings = {};
      for (const key of SPEECH_PARAMS) if (v.input[key] !== d[key]) settings[key] = v.input[key];
      segments[index] = { ...segments[index], text: v.input.text, settings };
      updateDraft({ segments });
      state.activeSegment = index;
    } else {
      if (!confirm('用这版的文案和参数替换当前草稿？生成记录会保留。')) return;
      const { segmentId, segmentName, ...input } = v.input;
      updateDraft({ ...input, ...(v.kind === 'speech' ? { mode: 'whole' } : {}) });
    }
    await flushSave();
    closeModal();
    render();
    return;
  }
  if (a === 'choose') {
    setChosen(el.dataset.id);
    return render();
  }
  if (a === 'reset-param') {
    resetParam(el.dataset.key);
    return render();
  }
  if (a === 'delete-version') {
    const v = state.db.versions.find(v => v.id === el.dataset.id);
    if (!confirm('删除这一版？音频文件会一起删掉，不能恢复。')) return;
    await api('/api/versions/' + v.id, 'DELETE');
    state.db.versions = state.db.versions.filter(x => x.id !== v.id);
    state.selected.delete(v.id);
    if (state.currentVersion === v.id) state.currentVersion = null;
    return render();
  }
  if (a === 'delete-project') {
    const p = project();
    const count = state.db.versions.filter(v => v.projectId === p.id).length;
    if (
      !confirm(
        `删除项目「${p.title}」${count ? `和它的 ${count} 个版本（音频文件一起删掉）` : ''}？不能恢复。`
      )
    )
      return;
    await api('/api/projects/' + p.id, 'DELETE');
    state.db.projects = state.db.projects.filter(x => x.id !== p.id);
    state.db.versions = state.db.versions.filter(v => v.projectId !== p.id);
    const next = state.db.projects.find(x => x.kind === p.kind);
    if (next) return selectProject(next.id);
    return newProject(p.kind);
  }
  if (a === 'import-scripts') return openImport();
  if (a === 'script-preview') return previewScripts();
  if (a === 'script-import') return importScripts();
  if (a === 'reload-scripts') return reloadScripts();
  if (a === 'export-chosen') return openExportChosen();
  if (a === 'save-key') {
    const provider = el.dataset.provider,
      value = $('#key-' + provider).value;
    if (!value.trim()) throw new Error('请先输入密钥');
    await api('/api/settings', 'PUT', { [provider]: value });
    $('#key-' + provider).value = '';
    await refresh();
    toast('密钥已保存在本机。');
    return;
  }
  if (a === 'test-key') {
    const provider = el.dataset.provider;
    $('#key-status-' + provider).textContent = '正在验证…';
    try {
      const r = await api('/api/settings/test/' + provider, 'POST', {});
      $('#key-status-' + provider).textContent = r.message;
    } catch (e) {
      $('#key-status-' + provider).textContent = e.message;
    }
    return;
  }
  if (a === 'record-start') return recordStart();
  if (a === 'record-pause') return state.recorder?.pause();
  if (a === 'record-stop') return state.recorder?.stop();
  if (a === 'use-recording') {
    if (!state.recorder?.blob) throw new Error('请先停止录音');
    return uploadAudio(
      new File(
        [state.recorder.blob],
        '浏览器录音.' + (state.recorder.blob.type.includes('mp4') ? 'm4a' : 'webm'),
        {
          type: state.recorder.blob.type,
        }
      ),
      false
    );
  }
  if (a === 'submit-clone') {
    if (!state.cloneUpload || state.uploadCount) throw new Error('请等待录音准备完成');
    state.cloneBusy = true;
    try {
      const job = await api('/api/clone', 'POST', {
        name: $('#voice-name').value,
        uploadId: state.cloneUpload.id,
        referenceId: state.refUpload?.id,
        referenceText: $('#reference-text').value,
        noiseReduction: $('#noise-reduction').checked,
        volumeNormalization: $('#volume-normalization').checked,
      });
      state.db.jobs.unshift(job);
      closeModal();
      state.view = 'voices';
      render();
      toast('已提交克隆，录音将由 MiniMax 处理。');
    } finally {
      state.cloneBusy = false;
    }
    return;
  }
  if (a === 'use-voice') {
    await navigate('speech');
    updateParam('voiceId', el.dataset.id);
    await flushSave();
    render();
    toast('已选用音色。填写文案后即可生成并试听。');
    return;
  }
  if (a === 'import-voice') {
    openModal(
      '导入已有克隆音色',
      markup`<label class="field">
    <span>MiniMax voice_id
    </span>
    <input id="import-id">
  </label>
  <label class="field">
    <span>显示名称
    </span>
    <input id="import-name" value="我的声音">
  </label>
  <button class="btn primary wide" data-action="do-import">查询账户并导入
  </button>`
    );
    return;
  }
  if (a === 'do-import') {
    await api('/api/voices/import', 'POST', {
      voiceId: $('#import-id').value,
      name: $('#import-name').value,
    });
    closeModal();
    await refresh();
    return;
  }
  if (a === 'music-mode') {
    const mode = el.dataset.mode;
    const d = draft();
    updateDraft({ mode, ...(mode === 'plan' && d.model === 'music_v1' ? { model: 'music_v2_5' } : {}) });
    return render();
  }
  if (a === 'music-template') {
    const texts = {
      'Lo-fi 讲解底乐':
        '温暖、轻盈的 Lo-fi，柔和电钢琴和轻鼓点，为卡牌解谜讲解留出空间。中段保持稳定，结尾自然收住。',
      轻快游戏宣传:
        '轻快的电子配乐，明亮的合成器和有弹性的低音，开头有吸引力，中段逐渐推进，结尾有干净利落的落点。',
      安静的钢琴: '简洁、安静的钢琴音乐，带一点好奇心和温暖感，音符不要太密集，适合游戏开发日志旁白。',
    };
    updateDraft({ prompt: texts[el.dataset.template] });
    return render();
  }
  if (a === 'add-chunk') {
    const chunks = [
      ...draft().chunks,
      { text: '[Section]', seconds: 15, positive: 'instrumental', negative: 'vocals' },
    ];
    if (chunks.length > 30) throw new Error('最多 30 段');
    updateDraft({ chunks });
    return render();
  }
  if (a === 'remove-chunk') {
    const chunks = [...draft().chunks];
    if (chunks.length <= 1) throw new Error('至少保留一段');
    chunks.splice(Number(el.dataset.index), 1);
    updateDraft({ chunks });
    return render();
  }
  if (a === 'generate-music') {
    await flushSave();
    const job = await api('/api/music', 'POST', { projectId: state.projectId, input: draft() });
    state.db.jobs.unshift(job);
    render();
    toast('已提交 ElevenLabs，生成完成后会保存在作品库。');
    return;
  }
  if (a === 'generate-score') {
    await flushSave();
    const job = await api('/api/score', 'POST', { projectId: state.projectId, input: draft() });
    state.db.jobs.unshift(job);
    render();
    toast('已开始本机合成，完成后会留一版。');
    return;
  }
  if (a === 'score-loop-preset') {
    updateDraft({ loop: true, bars: Number(el.dataset.bars) });
    return render();
  }
  if (a === 'export') return openExportSelected();
  if (a === 'do-export') return doExport();
}

export { generateSpeech, showRequest, action };
