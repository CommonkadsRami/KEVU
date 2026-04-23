export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return todayISO(dt);
}

export function weekDays(endIso = todayISO()) {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(addDays(endIso, -i));
  return out;
}

export function lastNDays(n, endIso = todayISO()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endIso, -i));
  return out;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtHeaderDate(d = new Date()) {
  return `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`.toUpperCase();
}

export function fmtShortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${MON[dt.getMonth()]} ${dt.getDate()}`;
}

export function dowShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return DOW[new Date(y, m - 1, d).getDay()][0];
}

export function fmtDuration(min) {
  if (!min || min < 1) return '—';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60), m = Math.round(min - h * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtKm(m) {
  if (!m) return '—';
  return `${(m / 1000).toFixed(2)} km`;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function toast(msg, ms = 1800) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

export function openSheet(node) {
  const dlg = $('#sheet');
  dlg.innerHTML = '';
  const inner = h('div', { class: 'sheet-inner' }, [h('div', { class: 'sheet-handle' }), node]);
  dlg.appendChild(inner);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }, { once: true });
  dlg.showModal();
}
export function closeSheet() { $('#sheet')?.close(); }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
