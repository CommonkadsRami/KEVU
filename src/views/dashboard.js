import { h, todayISO, fmtHeaderDate, clamp } from '../util.js';
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

function ring(cx, cy, r, stroke, pct, trackOpacity = 0.18) {
  const C = 2 * Math.PI * r;
  const p = clamp(pct, 0, 1.15);
  const track = svg('circle', { cx, cy, r, fill: 'none', stroke, 'stroke-opacity': trackOpacity, 'stroke-width': 14 });
  const fg    = svg('circle', {
    cx, cy, r,
    fill: 'none',
    stroke,
    'stroke-width': 14,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${C * p} ${C}`,
    transform: `rotate(-90 ${cx} ${cy})`
  });
  return [track, fg];
}

function headline(moveP, exerciseP, standP) {
  const min = Math.min(moveP, exerciseP, standP);
  if (min >= 1) return ['Crushing It', ' •'];
  if (min >= 0.7) return ['Almost There', ' •'];
  if (min >= 0.3) return ['Keep Going', ' •'];
  return ['Let’s Move', ' •'];
}

function stepsDots(cur, goal) {
  const segs = 10;
  const filled = Math.min(segs, Math.round((cur / goal) * segs));
  const row = h('div', { class: 'steps-dots' });
  for (let i = 0; i < segs; i++) row.appendChild(h('i', { class: i < filled ? 'on' : '' }));
  return row;
}

function hrChart(points) {
  const W = 320, H = 120, PAD = 8;
  if (!points.length) {
    return svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%' }, [
      svg('text', { x: W / 2, y: H / 2, fill: '#5a5a63', 'text-anchor': 'middle', 'font-size': 12 }, ['No data today'])
    ]);
  }
  const xs = points.map((_, i) => PAD + (i / (points.length - 1 || 1)) * (W - 2 * PAD));
  const vs = points.map((p) => p.bpm);
  const lo = Math.min(...vs) - 5, hi = Math.max(...vs) + 5;
  const ys = vs.map((v) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - 2 * PAD));

  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1], x1 = xs[i], y0 = ys[i - 1], y1 = ys[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const area = d + ` L ${xs[xs.length - 1]} ${H - PAD} L ${xs[0]} ${H - PAD} Z`;

  const grad = svg('linearGradient', { id: 'hrGrad', x1: 0, x2: 0, y1: 0, y2: 1 }, [
    svg('stop', { offset: '0', 'stop-color': '#ff3b55', 'stop-opacity': '0.55' }),
    svg('stop', { offset: '1', 'stop-color': '#ff3b55', 'stop-opacity': '0' })
  ]);
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%', preserveAspectRatio: 'none' }, [
    svg('defs', {}, [grad]),
    svg('path', { d: area, fill: 'url(#hrGrad)' }),
    svg('path', { d, fill: 'none', stroke: '#ff3b55', 'stroke-width': 2, 'stroke-linecap': 'round' })
  ]);
}

export function renderDashboard(root) {
  const s = store.get();
  const iso = todayISO();
  const day = s.daily[iso] || {};

  const moveKcal   = day.moveKcal   || 0;
  const exerciseMin= day.exerciseMin|| s.workouts.filter((w) => w.date === iso).reduce((a, w) => a + (w.durationMin || 0), 0);
  const standHr    = day.standHours || 0;
  const steps      = day.steps      || 0;
  const sleepHours = day.sleepHours || 0;
  const hr         = day.hr         || [];

  const moveP = moveKcal / (s.goals.move || 1);
  const exP   = exerciseMin / (s.goals.exercise || 1);
  const stP   = standHr / (s.goals.stand || 1);

  const [hl, dot] = headline(moveP, exP, stP);

  const header = h('header', { class: 'page-header' }, [
    h('div', { class: 'avatar' }, [(s.profile.name || 'M').slice(0, 1).toUpperCase()]),
    h('div', {}, [
      h('div', { class: 'date-line' }, [fmtHeaderDate()]),
      h('div', { class: 'greeting' }, [`Hey, ${s.profile.name || 'there'}`])
    ]),
    h('div', { class: 'header-spacer' }),
    h('button', { class: 'bell', onclick: () => location.hash = '#settings' }, [
      h('span', { html: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM9 21a3 3 0 0 0 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' })
    ])
  ]);

  const rings = svg('svg', { viewBox: '0 0 160 160', width: 150, height: 150 }, [
    ...ring(80, 80, 64, '#ff2d55', moveP),
    ...ring(80, 80, 48, '#b7ff3f', exP),
    ...ring(80, 80, 32, '#00e0ff', stP)
  ]);

  const goalsCard = h('section', { class: 'card goals-card' }, [
    h('div', { class: 'goals-head' }, [
      h('div', { class: 'goals-title' }, ["Today's Goals"]),
      h('span', { class: 'live-pill' }, [h('span', { class: 'live-dot' }), 'LIVE'])
    ]),
    h('h1', { class: 'goals-headline' }, [hl, h('span', { class: 'dot' }, [dot])]),
    h('div', { class: 'rings-and-bars' }, [
      h('div', { class: 'rings' }, [rings, h('div', { class: 'flame' }, ['🔥'])]),
      h('div', { class: 'metric-bars' }, [
        h('div', { class: 'metric move' }, [
          h('div', { class: 'label' }, ['Move']),
          h('div', { class: 'value mono' }, [`${Math.round(moveKcal)}/${s.goals.move}`]),
          h('div', { class: 'bar' }, [h('span', { style: { width: `${Math.min(100, moveP * 100)}%` } })])
        ]),
        h('div', { class: 'metric exercise' }, [
          h('div', { class: 'label' }, ['Exercise']),
          h('div', { class: 'value mono' }, [`${Math.round(exerciseMin)}/${s.goals.exercise}m`]),
          h('div', { class: 'bar' }, [h('span', { style: { width: `${Math.min(100, exP * 100)}%` } })])
        ]),
        h('div', { class: 'metric stand' }, [
          h('div', { class: 'label' }, ['Stand']),
          h('div', { class: 'value mono' }, [`${Math.round(standHr)}/${s.goals.stand}h`]),
          h('div', { class: 'bar' }, [h('span', { style: { width: `${Math.min(100, stP * 100)}%` } })])
        ])
      ])
    ])
  ]);

  const steps$ = h('section', { class: 'steps-card', onclick: () => promptSteps() }, [
    h('div', { class: 'goal' }, [`Goal ${(s.goals.steps / 1000).toFixed(0)}k`]),
    h('div', { class: 'card-title' }, ['🚶  Steps']),
    h('div', { class: 'big mono' }, [steps.toLocaleString('en-US')]),
    h('div', { class: 'delta' }, [steps ? `${Math.round((steps / s.goals.steps) * 100)}% of goal` : 'Tap to log']),
    stepsDots(steps, s.goals.steps)
  ]);

  const sleep$ = h('section', { class: 'sleep-card', onclick: () => promptSleep() }, [
    h('div', { class: 'card-title' }, ['🌙  Sleep']),
    h('div', { class: 'big mono' }, [sleepHours ? Math.round((sleepHours / 10) * 100).toString().slice(0, 2) : '—']),
    h('div', { class: 'sub' }, [sleepHours >= 7 ? 'EXCELLENT' : sleepHours >= 5 ? 'OK' : sleepHours ? 'LOW' : 'NOT SET']),
    h('div', { class: 'hours mono' }, [sleepHours ? `${sleepHours.toFixed(1)}h` : 'Tap to log'])
  ]);

  const grid2 = h('div', { class: 'grid-2' }, [steps$, sleep$]);

  const resting  = hr.length ? Math.min(...hr.map((x) => x.bpm)) : '—';
  const peak     = hr.length ? Math.max(...hr.map((x) => x.bpm)) : '—';
  const variability = hr.length >= 2
    ? Math.round(hr.reduce((a, x, i) => i ? a + Math.abs(x.bpm - hr[i - 1].bpm) : 0, 0) / (hr.length - 1))
    : '—';

  const hrCard = h('section', { class: 'card hr-card' }, [
    h('div', { class: 'hr-head' }, [
      h('div', { class: 'hr-left' }, [
        h('div', { class: 'hr-icon' }, [h('span', { html: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" fill="currentColor"/></svg>' })]),
        h('div', {}, [
          h('div', { class: 'hr-label' }, ['Heart Rate']),
          h('div', { class: 'hr-value mono' }, [hr.length ? `${Math.round(hr.reduce((a, x) => a + x.bpm, 0) / hr.length)} bpm·avg` : '— bpm'])
        ])
      ]),
      h('div', { class: 'segmented' }, [
        h('button', { class: 'on' }, ['1H']),
        h('button', {}, ['1D']),
        h('button', {}, ['1W'])
      ])
    ]),
    h('div', { class: 'hr-chart' }, [hrChart(hr)]),
    h('div', { class: 'hr-axis' }, ['6AM', '9AM', '12PM', '3PM', 'NOW'].map((t) => h('span', {}, [t]))),
    h('hr', { class: 'sep' }),
    h('div', { class: 'hr-stats' }, [
      h('div', { class: 'hr-stat' }, [h('div', { class: 'k' }, ['Resting']), h('div', { class: 'v mono' }, [String(resting)])]),
      h('div', { class: 'hr-stat' }, [h('div', { class: 'k' }, ['Peak']),    h('div', { class: 'v mono' }, [String(peak)])]),
      h('div', { class: 'hr-stat' }, [h('div', { class: 'k' }, ['Variability']), h('div', { class: 'v mono' }, [variability === '—' ? '—' : `${variability}ms`])])
    ])
  ]);

  root.replaceChildren(header, goalsCard, grid2, hrCard);
}

function promptSteps() {
  const cur = store.get().daily[todayISO()]?.steps || '';
  const v = prompt('Steps today:', cur);
  if (v == null) return;
  store.setDaily(todayISO(), { steps: Number(v) || 0 });
}
function promptSleep() {
  const cur = store.get().daily[todayISO()]?.sleepHours || '';
  const v = prompt('Hours slept last night:', cur);
  if (v == null) return;
  store.setDaily(todayISO(), { sleepHours: Number(v) || 0 });
}
