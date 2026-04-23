import { h, lastNDays, fmtShortDate } from '../util.js';
import { store } from '../store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return el;
}

const SERIES = [
  { key: 'steps',    label: 'Steps',    color: '#d8fe3a', unit: '',    fmt: (v) => v.toLocaleString() },
  { key: 'minutes',  label: 'Workouts', color: '#b7ff3f', unit: ' min', fmt: (v) => `${Math.round(v)} min` },
  { key: 'sleep',    label: 'Sleep',    color: '#a473ff', unit: 'h',   fmt: (v) => `${v.toFixed(1)}h` }
];

function seriesValue(key, day, workoutsForDate) {
  if (key === 'steps')    return day?.steps || 0;
  if (key === 'sleep')    return day?.sleepHours || 0;
  if (key === 'minutes')  return workoutsForDate.reduce((a, w) => a + (w.durationMin || 0), 0);
  return 0;
}

let activeSeries = 'steps';

export function renderTrends(root) {
  const s = store.get();
  const days = lastNDays(14);
  const byDate = {};
  for (const w of s.workouts) (byDate[w.date] ||= []).push(w);

  const series = SERIES.find((x) => x.key === activeSeries);
  const vals = days.map((d) => seriesValue(series.key, s.daily[d], byDate[d] || []));
  const total = vals.reduce((a, b) => a + b, 0);
  const avg = total / vals.length;
  const best = Math.max(...vals);

  const W = 520, H = 180, PAD = 22;
  const max = Math.max(best, 1);
  const xs = days.map((_, i) => PAD + (i / (days.length - 1)) * (W - 2 * PAD));
  const ys = vals.map((v) => H - PAD - (v / max) * (H - 2 * PAD));

  let dline = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1], x1 = xs[i], y0 = ys[i - 1], y1 = ys[i];
    const cx = (x0 + x1) / 2;
    dline += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const darea = dline + ` L ${xs.at(-1)} ${H - PAD} L ${xs[0]} ${H - PAD} Z`;

  const grad = svg('linearGradient', { id: 'tg', x1: 0, x2: 0, y1: 0, y2: 1 }, [
    svg('stop', { offset: '0', 'stop-color': series.color, 'stop-opacity': '0.35' }),
    svg('stop', { offset: '1', 'stop-color': series.color, 'stop-opacity': '0' })
  ]);
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, [
    svg('defs', {}, [grad]),
    svg('path', { d: darea, fill: 'url(#tg)' }),
    svg('path', { d: dline, fill: 'none', stroke: series.color, 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
    ...xs.map((x, i) => svg('circle', { cx: x, cy: ys[i], r: 3, fill: series.color }))
  ]);

  const header = h('header', { class: 'page-header' }, [
    h('div', {}, [
      h('div', { class: 'date-line' }, ['Trends · 14d']),
      h('div', { class: 'greeting' }, [series.label])
    ]),
    h('div', { class: 'header-spacer' }),
    h('div', { class: 'segmented' },
      SERIES.map((x) => h('button', {
        class: x.key === activeSeries ? 'on' : '',
        onclick: () => { activeSeries = x.key; renderTrends(root); }
      }, [x.label]))
    )
  ]);

  const stats = h('div', { class: 'card' }, [
    h('div', { class: 'row between' }, [
      h('div', {}, [h('div', { class: 'card-title' }, ['Total']), h('div', { class: 'greeting mono' }, [series.fmt(total)])]),
      h('div', {}, [h('div', { class: 'card-title' }, ['Avg/day']), h('div', { class: 'greeting mono' }, [series.fmt(avg)])]),
      h('div', {}, [h('div', { class: 'card-title' }, ['Best']),  h('div', { class: 'greeting mono' }, [series.fmt(best)])])
    ])
  ]);

  const card = h('div', { class: 'card trend-card' }, [
    chart,
    h('div', { class: 'legend' }, [
      h('span', {}, [h('i', { style: { background: series.color } }), `${fmtShortDate(days[0])} → ${fmtShortDate(days.at(-1))}`])
    ])
  ]);

  root.replaceChildren(header, stats, card);
}
