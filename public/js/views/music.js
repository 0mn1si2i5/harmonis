import { versionsHTML } from './versions.js';
import { draft } from '../draft.js';
import { markup, esc, options, icon } from '../util.js';
import { state } from '../state.js';
function musicHTML() {
  const d = draft();
  return markup`${!state.db.settings.elevenlabs ? '<div class="notice">请在 <button class="btn small ghost" data-action="nav" data-view="settings">服务设置</button> 填入具备 Music 权限的 ElevenLabs API Key。</div>' : ''}
  <div class="workspace">
    <div class="column">
    <section class="panel">
      <div class="panel-head">
        <strong>音乐创作
        </strong>
        <div class="segmented">
          <button data-action="music-mode" data-mode="prompt" class="${d.mode === 'prompt' ? 'active' : ''}">文字描述
          </button>
          <button data-action="music-mode" data-mode="plan" class="${d.mode === 'plan' ? 'active' : ''}">分段结构
          </button>
        </div>
      </div>
      <div class="editor-body">${
        d.mode === 'prompt'
          ? markup`<textarea id="music-prompt" class="music-prompt" aria-label="音乐描述" placeholder="例如：温暖的 Lo-fi 配乐，柔和电钢琴和轻鼓点，为游戏规则讲解留出空间，结尾自然收住。">${esc(d.prompt)}
  </textarea>
  <div class="chips">${['Lo-fi 讲解底乐', '轻快游戏宣传', '安静的钢琴'].map(s => `<button data-action="music-template" data-template="${s}">${s}</button>`).join('')}
  </div>`
          : d.chunks
              .map(
                (c, n) => markup`<div class="chunk">
    <div class="row">
      <span class="chunk-label">第 ${n + 1} 段
      </span>
      <input type="number" min="3" max="120" value="${c.seconds}" data-chunk="${n}" data-key="seconds" aria-label="第${n + 1}段秒数">
      <span class="subtle">秒
      </span>
      <button class="btn small ghost" data-action="remove-chunk" data-index="${n}">移除
      </button>
    </div>
    <textarea data-chunk="${n}" data-key="text" aria-label="第${n + 1}段描述或歌词">${esc(c.text)}
    </textarea>
    <input data-chunk="${n}" data-key="positive" value="${esc(c.positive)}" placeholder="想要的风格，逗号分隔" aria-label="第${n + 1}段正向风格">
    <input data-chunk="${n}" data-key="negative" value="${esc(c.negative)}" placeholder="避免的风格，例如 vocals" aria-label="第${n + 1}段反向风格">
  </div>`
              )
              .join('') + '<button class="btn ghost" data-action="add-chunk">添加音乐段落</button>'
      }
        <p class="subtle">${d.mode === 'prompt' ? '风格、乐器和节奏写在描述中；时长和纯音乐开关作为独立参数。' : '分段结构对应 composition_plan，每段 3–120 秒，总计最多 10 分钟；可填写歌词。纯音乐请在风格中指定并避免 vocals，结构模式没有强制纯音乐参数。'}
        </p>
      </div>
      <div class="editor-footer">
        <button class="btn small ghost" data-action="request">查看实际请求
        </button>
        <span id="save-state">已保存到本机
        </span>
      </div>
    </section>
    ${versionsHTML()}
    </div>
    <aside class="panel inspector">
      <div class="field">
        <label for="music-model">ElevenLabs 模型
        </label>
        <select id="music-model" data-music="model">${options(d.mode === 'plan' ? ['music_v2', 'music_v2_5'] : ['music_v1', 'music_v2', 'music_v2_5'], d.model)}
        </select>
      </div>${
        d.mode === 'prompt'
          ? markup`<div class="field">
    <label for="duration">目标时长（秒）
    </label>
    <input id="duration" data-music="duration" type="number" min="3" max="600" value="${d.duration}">
    <small>对应 music_length_ms · 3–600 秒
    </small>
  </div>
  <label class="checkbox">
    <input id="instrumental" data-music="instrumental" type="checkbox" ${d.instrumental ? 'checked' : ''}>强制纯音乐（无人声）
  </label>`
          : ''
      }
      <div class="field">
        <label for="music-format">生成格式
        </label>
        <select id="music-format" data-music="format">${options(['mp3_44100_128', 'mp3_48000_192'], d.format, { mp3_44100_128: 'MP3 · 44.1 kHz / 128 kbps', mp3_48000_192: 'MP3 · 48 kHz / 192 kbps', pcm_44100: 'PCM · 44.1 kHz（封装 WAV）' })}
        </select>
        <small>高码率需要相应套餐权限。WAV 下载由本机转码，不提升原始音质。
        </small>
      </div>
      <div class="generate-actions">
        <button class="btn primary wide" data-action="generate-music">${icon('spark')}生成音乐
        </button>
        <details class="cost">
          <summary>参考用量价值 <b id="music-cost">${musicCost()}</b></summary>
          <p>按公开标价 $0.15／分钟估算，非最终账单。套餐抵扣、最低计量与税费以账户为准，每次重做会重新计费。
          </p>
        </details>
      </div>
    </aside>
  </div>`;
}
function musicCost() {
  const d = draft();
  const seconds =
    d.mode === 'plan' ? d.chunks.reduce((a, c) => a + Number(c.seconds || 0), 0) : Number(d.duration || 0);
  return '$' + ((seconds / 60) * 0.15).toFixed(3);
}

export { musicHTML, musicCost };
