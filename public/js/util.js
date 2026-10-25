const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)];
const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const paths = {
  mic: 'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0zm-4 6v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  music: 'M9 18V5l11-2v13M9 9l11-2M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3m11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3',
  grid: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  spark: 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z',
  plus: 'M12 4v16M4 12h16',
  play: 'M8 5v14l11-7z',
  score: 'M4 6h16M4 12h10M4 18h7M17 14v7m-3-3h6',
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.grid}"/></svg>`;
function fmtTime(seconds) {
  const s = Math.round(seconds || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function date(t) {
  return new Date(t).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function options(items, value, names = {}) {
  return items
    .map(i => `<option value="${esc(i)}" ${value === i ? 'selected' : ''}>${esc(names[i] || i)}</option>`)
    .join('');
}

// Remove source-only line breaks so HTML strings retain their original bytes.
function markup(parts, ...values) {
  return parts.reduce(
    (out, part, i) => out + part.replace(/\n[ \t]*/g, '') + (i < values.length ? values[i] : ''),
    ''
  );
}

export { $, $$, esc, paths, icon, fmtTime, date, options, markup };
