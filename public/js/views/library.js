import { markup } from '../util.js';
import { state } from '../state.js';
import { versionRow } from './versions.js';
function libraryHTML() {
  return markup`<div class="heading">
    <div>
      <h1>作品库
      </h1>
      <p class="num">${state.db.versions.length} 个版本。勾选后可以一起导出。
      </p>
    </div>
    <button class="btn small ghost" data-action="export">导出已勾选版本
    </button>
  </div>
  <div class="panel">${state.db.versions.length ? state.db.versions.map(versionRow).join('') : '<div class="empty">还没有生成作品。</div>'}
  </div>`;
}

export { libraryHTML };
