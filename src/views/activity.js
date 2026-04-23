import { h, todayISO, fmtDuration, fmtKm, fmtShortDate, openSheet, closeSheet, toast } from '../util.js';
import { store } from '../store.js';
import { isConnected, syncNow } from '../strava.js';

const TYPES = [
  { k: 'Run',      icon: '🏃' },
  { k: 'Ride',     icon: '🚴' },
  { k: 'Strength', icon: '💪' },
  { k: 'Yoga',     icon: '🧘' },
  { k: 'Swim',     icon: '🏊' },
  { k: 'HIIT',     icon: '🔥' },
  { k: 'Walk',     icon: '🚶' },
  { k: 'Rowing',   icon: '🚣' },
  { k: 'Other',    icon: '⭐' }
];
const iconFor = (k) => TYPES.find((t) => t.k === k)?.icon || '⭐';

export function renderActivity(root) {
  const s = store.get();
  const workouts = [...s.workouts].sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')));

  const header = h('header', { class: 'page-header' }, [
    h('div', {}, [
      h('div', { class: 'date-line' }, ['Activity']),
      h('div', { class: 'greeting' }, [`${workouts.length} workouts`])
    ]),
    h('div', { class: 'header-spacer' }),
    isConnected()
      ? h('button', { class: 'btn small', onclick: doSync }, ['⟳ Sync Strava'])
      : null
  ]);

  const today    = workouts.filter((w) => w.date === todayISO());
  const earlier  = workouts.filter((w) => w.date !== todayISO());

  const list = h('div', { class: 'list' });
  if (!workouts.length) {
    list.appendChild(h('div', { class: 'empty' }, ['No workouts yet. Tap + to log one, or connect Strava in Settings.']));
  } else {
    if (today.length) {
      list.appendChild(sectionTitle('Today'));
      today.forEach((w) => list.appendChild(workoutRow(w)));
    }
    if (earlier.length) {
      list.appendChild(sectionTitle('Earlier'));
      earlier.forEach((w) => list.appendChild(workoutRow(w)));
    }
  }

  const fab = h('button', { class: 'fab', onclick: () => openWorkoutSheet() }, [
    h('span', { html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>' })
  ]);

  root.replaceChildren(header, list, fab);
}

function sectionTitle(text) {
  return h('div', { class: 'section-title' }, [h('h2', {}, [text])]);
}

function workoutRow(w) {
  const right = h('div', { class: 'right' }, [
    h('div', { class: 'r1 mono' }, [fmtDuration(w.durationMin)]),
    h('div', { class: 'r2 mono' }, [w.distanceM ? fmtKm(w.distanceM) : (w.calories ? `${w.calories} kcal` : fmtShortDate(w.date))])
  ]);
  return h('div', {
    class: 'item clickable',
    onclick: () => openWorkoutSheet(w)
  }, [
    h('div', { class: 'icon' }, [iconFor(w.type)]),
    h('div', {}, [
      h('div', { class: 't1' }, [w.notes || w.type]),
      h('div', { class: 't2' }, [`${w.type} · ${fmtShortDate(w.date)}${w.source === 'strava' ? ' · Strava' : ''}`])
    ]),
    right
  ]);
}

function openWorkoutSheet(existing) {
  const state = { type: existing?.type || 'Run', date: existing?.date || todayISO() };
  const chipRow = h('div', { class: 'chips' },
    TYPES.map((t) => h('button', {
      class: `chip${state.type === t.k ? ' on' : ''}`,
      onclick: (e) => {
        state.type = t.k;
        e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        e.currentTarget.classList.add('on');
      }
    }, [`${t.icon} ${t.k}`]))
  );

  const durInput  = h('input', { type: 'number', inputmode: 'numeric', placeholder: '30', value: existing?.durationMin || '' });
  const distInput = h('input', { type: 'number', inputmode: 'decimal', placeholder: '5.0', value: existing?.distanceM ? (existing.distanceM / 1000).toFixed(2) : '' });
  const kcalInput = h('input', { type: 'number', inputmode: 'numeric', placeholder: '320', value: existing?.calories || '' });
  const dateInput = h('input', { type: 'date', value: state.date });
  const notesInput = h('input', { type: 'text', placeholder: 'Morning run along the river', value: existing?.notes || '' });

  const form = h('div', { class: 'form' }, [
    chipRow,
    h('div', { class: 'field' }, [h('label', {}, ['Duration (min)']), durInput]),
    h('div', { class: 'field' }, [h('label', {}, ['Distance (km)']), distInput]),
    h('div', { class: 'field' }, [h('label', {}, ['Calories']), kcalInput]),
    h('div', { class: 'field' }, [h('label', {}, ['Date']), dateInput]),
    h('div', { class: 'field' }, [h('label', {}, ['Notes']), notesInput]),
    h('div', { class: 'row', style: { gap: '10px', marginTop: '6px' } }, [
      existing ? h('button', { class: 'btn danger', onclick: () => { store.removeWorkout(existing.id); closeSheet(); toast('Deleted'); } }, ['Delete']) : null,
      h('div', { style: { flex: 1 } }),
      h('button', { class: 'btn ghost', onclick: () => closeSheet() }, ['Cancel']),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const km = parseFloat(distInput.value) || 0;
          store.addWorkout({
            id: existing?.id,
            type: state.type,
            date: dateInput.value || todayISO(),
            durationMin: parseFloat(durInput.value) || 0,
            distanceM: Math.round(km * 1000),
            calories: parseFloat(kcalInput.value) || 0,
            notes: notesInput.value,
            source: existing?.source || 'manual',
            strava_id: existing?.strava_id || null
          });
          closeSheet();
          toast(existing ? 'Updated' : 'Logged');
        }
      }, ['Save'])
    ])
  ]);

  openSheet(h('div', {}, [h('h3', {}, [existing ? 'Edit workout' : 'Log workout']), form]));
}

async function doSync() {
  toast('Syncing…');
  try {
    const res = await syncNow();
    toast(`Synced · +${res.added} added`);
  } catch (e) {
    toast(`Sync failed: ${e.message}`);
  }
}
