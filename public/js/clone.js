import { state } from './state.js';
import { openModal, dialogError } from './modal.js';
import { markup, $, fmtTime, esc, date } from './util.js';
import { api } from './api.js';
import { Recorder } from './recorder.js';
function openClone() {
  state.cloneUpload = null;
  state.refUpload = null;
  state.cloneBusy = false;
  const savedRecordings = state.db.uploads.filter(u => !u.reference);
  openModal(
    '建立自己的音色',
    markup`<p class="subtle">自然地读完参考稿，像向朋友讲解游戏。先在本机试听，点“提交克隆”才会发送给 MiniMax。
  </p>
  ${savedRecordings.length ? `<div class="notice"><label class="field"><span>复用已保存的录音，无需重新录制</span><select id="saved-recording">${savedRecordings.map((u, i) => `<option value="${esc(u.id)}">录音 ${i + 1} · ${fmtTime(u.duration)} · ${date(u.createdAt)}</option>`).join('')}</select></label><button class="btn small ghost" id="use-saved-recording">使用已保存录音</button></div>` : ''}
  <div class="reading">今天，我想和你分享一个正在制作的游戏。规则很简单：把几张卡牌摆成一排，看它们一步步发生变化。有时候，只需要换一个位置，结果就会完全不同。先别急着找答案，我们可以慢慢试。你看，火焰穿过蜡块，花朵结出果实，种子又长成了新的一排。这就是我喜欢做游戏的原因：从一个小小的想法开始，看它变得有趣，也让更多人参与进来。
  </div>
  <div class="record-controls">
    <output id="record-time">00:00
    </output>
    <button class="btn primary" data-action="record-start" id="record-start">● 开始录音
    </button>
    <button class="btn ghost" data-action="record-pause" id="record-pause" disabled>暂停
    </button>
    <button class="btn ghost" data-action="record-stop" id="record-stop" disabled>停止
    </button>
  </div>
  <div class="field level" id="level" hidden>
    <div class="label-row"><span>输入电平</span><span class="hint num" id="level-peak">峰值 —</span></div>
    <div class="meter" aria-hidden="true"><i id="level-bar"></i><b id="level-hold"></b></div>
    <div class="scale num" aria-hidden="true"><span>-60</span><span>-18</span><span>-6</span><span>0 dBFS</span></div>
  </div>
  <p class="subtle" id="record-state">录音要求 10 秒至 5 分钟，建议 30–60 秒。说话最响时峰值在 -18 到 -6 dBFS 之间比较好。
  </p>
  <audio id="record-audio" controls hidden>
  </audio>
  <button class="btn small" id="use-recording" data-action="use-recording" hidden>使用这段录音
  </button>
  <label class="upload-box">或者上传已有音频
    <input id="clone-file" type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav">
    <span class="subtle">MP3 / M4A / WAV，转换后不超过 20 MB。
    </span>
  </label>
  <p class="notice" id="upload-ready" hidden>
  </p>
  <div id="upload-check">
  </div>
  <label class="field">
    <span>音色名称
    </span>
    <input id="voice-name" value="我的声音" maxlength="80">
  </label>
  <details class="details">
    <summary>克隆高级设置
    </summary>
    <label class="checkbox">
      <input id="noise-reduction" type="checkbox">启用 MiniMax 降噪
    </label>
    <label class="checkbox">
      <input id="volume-normalization" type="checkbox">启用音量归一化
    </label>
    <label class="field">
      <span>可选：少于 8 秒的参考音频
      </span>
      <input id="reference-file" type="file" accept=".mp3,.m4a,.wav">
      <small id="reference-status">帮助模型参考说话方式，可留空。
      </small>
    </label>
    <label class="field">
      <span>参考音频对应的准确文字
      </span>
      <textarea id="reference-text" rows="2">
      </textarea>
    </label>
  </details>
  <p class="subtle">需要 MiniMax 账户认证与克隆权限。这里先建立音色；成功后在配音页生成试听，正式使用按账户规则计费。
  </p>
  <button class="btn primary wide spaced" data-action="submit-clone" id="submit-clone" disabled>提交 MiniMax 克隆
  </button>`
  );
  $('#use-saved-recording')?.addEventListener('click', () => {
    const saved = savedRecordings.find(u => u.id === $('#saved-recording').value);
    if (!saved || state.uploadCount || state.cloneBusy) return;
    state.cloneUpload = saved;
    $('#record-audio').src = '/api/uploads/' + saved.id + '/audio';
    $('#record-audio').hidden = false;
    $('#upload-ready').hidden = false;
    $('#upload-ready').textContent = `已选用本机录音 · ${fmtTime(saved.duration)} · ${date(saved.createdAt)}`;
    $('#upload-check').innerHTML = checkHTML(saved);
    $('#submit-clone').disabled = false;
  });
  $('#clone-file').addEventListener('change', () =>
    uploadAudio($('#clone-file').files[0], false).catch(dialogError)
  );
  $('#reference-file').addEventListener('change', () =>
    uploadAudio($('#reference-file').files[0], true).catch(dialogError)
  );
}
async function uploadAudio(file, reference) {
  if (!file) return;
  state.uploadCount++;
  const form = new FormData();
  form.append('audio', file, file.name || '浏览器录音.webm');
  form.append('reference', String(reference));
  const target = reference ? $('#reference-status') : $('#upload-ready');
  target.hidden = false;
  target.textContent = '正在本机检查并转换音频…';
  if ($('#submit-clone')) $('#submit-clone').disabled = true;
  try {
    const result = await api('/api/uploads', 'POST', form);
    if (!state.db.uploads.some(u => u.id === result.id)) state.db.uploads.unshift(result);
    if (reference) state.refUpload = result;
    else {
      state.cloneUpload = result;
      $('#record-audio').src = '/api/uploads/' + result.id + '/audio';
      $('#record-audio').hidden = false;
    }
    target.textContent = `已准备：${result.name} · ${fmtTime(result.duration)} · ${(result.bytes / 1024 / 1024).toFixed(1)} MB`;
    if (!reference) $('#upload-check').innerHTML = checkHTML(result);
  } catch (e) {
    target.textContent = '音频准备失败';
    throw e;
  } finally {
    state.uploadCount--;
    if ($('#submit-clone'))
      $('#submit-clone').disabled = !state.cloneUpload || state.cloneBusy || state.uploadCount > 0;
  }
}
// 录音检查：本机 ffmpeg 测出来的峰值、平均响度和底噪
const finite = (v, digits) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
function checkHTML(r) {
  const a = r.analysis,
    d = r.duration;
  const rows = [
    [
      '时长',
      d >= 10 && d <= 300,
      `${Math.round(d)} 秒` +
        (d < 10
          ? '，太短，至少 10 秒'
          : d > 300
            ? '，超过 5 分钟'
            : d < 30
              ? '，可以用，30–60 秒更好'
              : '，合格'),
    ],
  ];
  if (a) {
    const clip = a.peakDb > -1,
      quiet = a.lufs < -30,
      noisy = a.noiseFloorDb > -50;
    rows.push(
      [
        '峰值',
        !clip,
        `${finite(a.peakDb, 1)} dBFS` + (clip ? '，可能削波，离麦克风远一点或调低增益' : '，没有削波'),
      ],
      ['平均响度', !quiet, `${finite(a.lufs, 0)} LUFS` + (quiet ? '，偏小，靠近麦克风一点' : '')],
      [
        '底噪（最安静的 0.5 秒）',
        !noisy,
        `${finite(a.noiseFloorDb, 0)} dBFS` + (noisy ? '，偏高，换个安静的房间更好' : ''),
      ]
    );
  }
  return `<p class="subtle">本机检查结果：</p><div class="res num">${rows
    .map(([k, ok, v]) => `<div><span>${k}</span><span class="${ok ? 'ok' : 'warn'}">${esc(v)}</span></div>`)
    .join('')}</div>`;
}
// 电平表：-60 到 0 dBFS 映射到整条宽度
const levelPos = db => Math.max(0, Math.min(1, (db + 60) / 60));
function showLevel({ peak, maxPeak }) {
  if (!$('#level')) return;
  $('#level').hidden = false;
  $('#level-bar').style.transform = `scaleX(${1 - levelPos(peak)})`;
  $('#level-hold').style.left = levelPos(maxPeak) * 100 + '%';
  $('#level-peak').textContent = Number.isFinite(maxPeak) ? `峰值 ${maxPeak.toFixed(1)} dBFS` : '峰值 —';
  $('#level-peak').classList.toggle('warn', maxPeak > -1);
}
async function recordStart() {
  state.recorder?.stop();
  state.recorder = new Recorder(s => {
    if (!$('#record-time')) return;
    $('#record-time').textContent = fmtTime(s.elapsed);
    $('#record-pause').disabled = !['recording', 'paused'].includes(s.state);
    $('#record-stop').disabled = !['recording', 'paused'].includes(s.state);
    $('#record-start').disabled = ['recording', 'paused'].includes(s.state);
    $('#record-pause').textContent = s.state === 'paused' ? '继续' : '暂停';
    $('#record-state').textContent =
      s.state === 'paused'
        ? '已暂停'
        : s.state === 'recording'
          ? '正在录音，停止后可以试听。'
          : s.state === 'stopped'
            ? '录音已停止。先试听，满意后点“使用这段录音”。'
            : s.error || '';
    if (s.blob) {
      if (state.recURL) URL.revokeObjectURL(state.recURL);
      state.recURL = URL.createObjectURL(s.blob);
      $('#record-audio').src = state.recURL;
      $('#record-audio').hidden = false;
      $('#use-recording').hidden = false;
      $('#record-start').textContent = '重新录音';
    }
  }, showLevel);
  try {
    await state.recorder.start();
  } catch (e) {
    dialogError(
      new Error(
        e.name === 'NotAllowedError'
          ? '麦克风权限被拒绝。请在浏览器地址栏允许麦克风，或上传已有音频。'
          : e.name === 'NotFoundError'
            ? '没有找到麦克风，请连接麦克风或上传音频。'
            : e.message
      )
    );
  }
}

export { openClone, uploadAudio, recordStart };
