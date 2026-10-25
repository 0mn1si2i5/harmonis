import { serviceLinks } from '../service-links.js';
import { markup, esc } from '../util.js';
import { state } from '../state.js';
function settingsHTML() {
  return markup`<div class="heading">
    <div>
      <h1>服务设置
      </h1>
      <p>密钥仅保存在这台 Mac。文案和录音会发送给对应供应商处理。
      </p>
    </div>
  </div>
  <div class="settings-grid">${[
    ['minimax', 'MiniMax', '音色克隆与配音', serviceLinks.minimax.keys],
    ['elevenlabs', 'ElevenLabs', '音乐创作', serviceLinks.elevenlabs.keys],
  ]
    .map(
      ([key, name, what, url]) =>
        markup`<section class="panel settings-card">
    <div class="row between">
      <h2>${name}
      </h2>
      <span class="badge">${state.db.settings[key] ? '已保存密钥' : '未配置'}
      </span>
    </div>
    <p>${what}${key === 'minimax' ? ' · 中国站 API，克隆需要账户认证' : ' · 需要 Music 访问权限与适用套餐'}
    </p>
    ${key === 'minimax' ? `<p class="key-type ${state.db.settings.minimaxKeyType === 'subscription' ? 'key-warning' : ''}">${state.db.settings.minimaxKeyType === 'subscription' ? '当前为订阅 Key（sk-cp-）：使用 M Plan / 积分，不会使用按量钱包余额。要使用账户钱包，请在「获取密钥」中复制按量 API Key。' : state.db.settings.minimaxKeyType === 'payg' ? '当前为按量 API Key（sk-api-），使用对应账户的钱包或适用资源包。' : '使用账户钱包时，请填写「请求管理 → API Keys」中的按量 Key；订阅 Key 使用另一套额度。'}</p>` : ''}
    <label class="field">
      <span>API Key
      </span>
      <input id="key-${key}" type="password" autocomplete="off" spellcheck="false" placeholder="${state.db.settings[key] ? '留空保留现有密钥；填写新值可替换' : '在这里粘贴 API Key'}">
    </label>
    <div class="row wrap">
      <button class="btn primary" data-action="save-key" data-provider="${key}">保存密钥
      </button>
      <button class="btn ghost" data-action="test-key" data-provider="${key}" ${!state.db.settings[key] ? 'disabled' : ''}>验证连接
      </button>
      ${state.db.settings[key] ? `<button class="btn ghost danger" data-action="remove-key" data-provider="${key}">移除密钥</button>` : ''}
      <a class="help-link" href="${url}" target="_blank" rel="noreferrer">获取密钥 ↗
      </a>
    </div>
    <div class="service-console-links">
      <a class="btn small ghost" href="${serviceLinks[key].console}" target="_blank" rel="noopener noreferrer">${name} 官方控制台 ↗</a>
      ${key === 'minimax' ? `<a class="help-link" href="${serviceLinks.minimax.wallet}" target="_blank" rel="noopener noreferrer">余额与代金券 ↗</a>` : ''}
    </div>
    <p class="subtle key-status" id="key-status-${key}">
    </p>
  </section>`
    )
    .join('')}
  </div>
  <details class="panel data-note">
    <summary>本机数据与运行环境</summary>
    ${window.harmonisDesktop ? '<button class="btn small ghost spaced" data-action="open-data-folder">在 Finder 中打开</button>' : ''}
    <br>${esc(state.db.dataDir)}
    <br>项目、录音、生成版本和音频保存在这里。密钥文件仅当前用户可读写，不会传回网页。
    <br>
    <span id="audio-tools">正在检查音频处理工具…
    </span>
    <br>编曲合成用的 Python：${state.db.tools?.python ? esc(state.db.tools.python) : state.db.tools?.python === false ? '没有找到装了 numpy 和 scipy 的 Python，可用环境变量 SHENGJIAN_PYTHON 指定' : '正在检查'}
  </details>`;
}

export { settingsHTML };
