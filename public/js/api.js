import { $ } from './util.js';
import { state } from './state.js';
async function api(url, method = 'GET', body) {
  const options = { method, headers: { 'X-Shengjian': '1' } };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('本机服务没有返回有效响应，请检查服务是否仍在运行。');
  }
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5500);
}
function showError(e) {
  toast(e.message || String(e));
}

export { api, toast, showError };
