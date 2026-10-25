import { markup, icon, esc, date } from '../util.js';
import { taskHTML } from './tasks.js';
import { state } from '../state.js';
function voicesHTML() {
  return markup`<div class="heading">
    <div>
      <h1>我的音色
      </h1>
      <p>MiniMax 克隆音色。录一段或上传一段音频就能建立。
      </p>
    </div>
    <div class="row"><button class="btn ghost" data-action="manage-recordings">录音管理</button>
    <button class="btn primary" data-action="clone-dialog">${icon('plus')}建立音色
    </button></div>
  </div>
  <div id="tasks" class="tasks">${taskHTML()}
  </div>
  <div class="grid-cards">${
    state.db.voices
      .map(
        v => markup`<article class="panel voice-card">
    <div class="voice-icon">${icon('mic')}
    </div>
    <h3>${esc(v.name)}
    </h3>
    <p>${esc(v.voiceId)}
      <br>${v.firstUsedAt ? '已成功用于正式配音' : v.imported ? '从账户导入' : '尚未正式使用 · 创建后 7 天内需生成一次配音'}
      <br>建立于 ${date(v.createdAt)}
    </p>
    <div class="row"><button class="btn" data-action="use-voice" data-id="${v.voiceId}">使用这个音色
    </button><button class="btn ghost danger" data-action="delete-voice" data-id="${esc(v.id)}" aria-label="删除音色 ${esc(v.name)}">删除</button></div>
  </article>`
      )
      .join('') || '<div class="panel empty">还没有自己的音色。<br>录音或上传后即可提交 MiniMax 克隆。</div>'
  }
  </div>
  <div class="data-note">MiniMax 要求账户完成个人或企业认证。克隆成功后，请在 7 天内完成一次正式配音调用。
    <br>
    <button class="btn small ghost spaced" data-action="import-voice">导入当前 MiniMax 账户已有的克隆音色
    </button>
  </div>`;
}

export { voicesHTML };
