import { versionsHTML } from './versions.js';
import { draft } from '../draft.js';
import { markup, esc, options, icon } from '../util.js';
import { state } from '../state.js';

const currentScore = () => (state.db.scores || []).find(s => s.file === draft().score);
// 拨弦数据有几步：去掉空行、注释和表头
function pluckCount(text) {
  const rows = String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && /^\d/.test(l));
  return rows.length ? `${rows.length} 步拨弦` : '没有拨弦，拨弦轨静音';
}
function scoreNote() {
  const d = draft(),
    s = currentScore();
  const bars = d.bars || s?.bars;
  if (!s?.bpm || !bars) return '本机合成，不计费。';
  const seconds = (bars * 4 * 60) / s.bpm;
  return `${bars} 小节，约 ${seconds.toFixed(1)} 秒${d.loop ? '，首尾无缝相接' : '，另加尾音'}。本机合成，不计费。`;
}
function scoreHTML() {
  const d = draft(),
    scores = state.db.scores || [],
    s = currentScore();
  const python = state.db.tools?.python;
  return markup`${
    python === false
      ? '<div class="notice error">没有找到装了 numpy 和 scipy 的 Python。装好后再合成，或用环境变量 SHENGJIAN_PYTHON 指定解释器。</div>'
      : ''
  }
  <div class="workspace">
    <div class="column">
    <section class="panel">
      <div class="panel-head">
        <strong>拨弦</strong>
        <span class="hint">每行：小节,拍,牌数。牌数决定音高，多一张升一级五声音阶</span>
      </div>
      <div class="editor-body">
        <textarea id="score-plucks" class="script mono" data-score="plucks" aria-label="拨弦数据" placeholder="小节,拍,牌数&#10;2,0,4&#10;2,1,5&#10;2,2,6">${esc(d.plucks)}</textarea>
      </div>
      <div class="editor-footer num">
        <span id="pluck-count">${pluckCount(d.plucks)}</span>
        <span class="save-state" id="save-state">已保存</span>
      </div>
    </section>
    ${versionsHTML()}
    </div>
    <aside class="panel inspector">
      <div class="field">
        <label for="score-file">曲谱</label>
        <select id="score-file" data-score="score">${options(
          scores.map(s => s.file),
          d.score,
          Object.fromEntries(scores.map(s => [s.file, s.title]))
        )}</select>
        <small class="num">${s ? `${s.bpm} BPM · ${s.bars} 小节 · synth/scores/${esc(s.file)}` : ''}</small>
      </div>
      <div class="field">
        <label for="score-bars">小节数</label>
        <input id="score-bars" class="num" type="number" min="1" max="128" data-score="bars" value="${d.bars ?? ''}" placeholder="${s?.bars ?? ''}">
        <small>留空用曲谱自己的小节数。</small>
      </div>
      <label class="check"><input type="checkbox" id="score-loop" data-score="loop" ${d.loop ? 'checked' : ''}><span>无缝循环：去掉弱起，尾音折回开头</span></label>
      <div class="chips">${[5, 6, 9]
        .map(n => `<button data-action="score-loop-preset" data-bars="${n}">${n} 小节循环</button>`)
        .join('')}</div>
      <details class="details">
      <summary>高级设置</summary>
      <div class="field">
        <label for="score-seed">随机种子</label>
        <input id="score-seed" class="num" type="number" min="0" data-score="seed" value="${d.seed ?? ''}" placeholder="曲谱默认">
        <small>鼓和噪声的随机细节。种子相同，合成结果相同。</small>
      </div>
      </details>
      <div class="generate-actions">
        <button class="btn primary wide" data-action="generate-score" ${python === false ? 'disabled' : ''}>${icon('spark')}合成</button>
        <p class="generate-note num" id="score-note">${scoreNote()}</p>
      </div>
    </aside>
  </div>`;
}

export { scoreHTML, scoreNote, pluckCount };
