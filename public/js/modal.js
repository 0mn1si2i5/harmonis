import { $, markup } from './util.js';
import { state } from './state.js';
import { showError } from './api.js';
function openModal(title, body) {
  $('#modal').innerHTML = markup`<div class="dialog-head">
    <h2>${title}
    </h2>
    <button class="close" data-action="close" aria-label="关闭弹窗">×
    </button>
  </div>${body}
  <p class="dialog-error" id="dialog-error" role="alert">
  </p>`;
  $('#modal').showModal();
}
function closeModal() {
  state.recorder?.stop();
  $('#modal').close();
}
function dialogError(e) {
  if ($('#dialog-error')) $('#dialog-error').textContent = e.message || e;
  else showError(e);
}

export { openModal, closeModal, dialogError };
