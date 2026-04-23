import { h, weekDays, todayISO, dowShort, openSheet, closeSheet, toast } from '../util.js';
import { store } from '../store.js';

function streak(history) {
  let n = 0;
  let iso = todayISO();
  while (history[iso]) {
    n++;
    const [y, m, d] = iso.split('-').map(Number);
    iso = new Date(y, m - 1, d - 1).toISOString().slice(0, 10);
  }
  return n;
}

export function renderHabits(root) {
  const s = store.get();
  const header = h('header', { class: 'page-header' }, [
    h('div', {}, [
      h('div', { class: 'date-line' }, ['Habits']),
      h('div', { class: 'greeting' }, [`${s.habits.length} habits`])
    ]),
    h('div', { class: 'header-spacer' }),
    h('button', { class: 'btn small primary', onclick: () => openAddHabit() }, ['+ New'])
  ]);

  const week = weekDays();
  const iso = todayISO();

  const list = h('div', { class: 'list' });
  if (!s.habits.length) list.appendChild(h('div', { class: 'empty' }, ['No habits yet. Tap "+ New" to add one.']));
  for (const hb of s.habits) {
    const done = week.filter((d) => hb.history[d]).length;
    const row = h('div', { class: 'habit-row' }, [
      h('div', { class: 'icon', style: { background: 'rgba(255,255,255,0.06)', borderRadius: '12px', width: '42px', height: '42px', display: 'grid', placeItems: 'center', fontSize: '20px' } }, [hb.emoji]),
      h('div', {}, [
        h('div', { class: 'name' }, [hb.name]),
        h('div', { class: 'streak' }, [`🔥 ${streak(hb.history)}-day streak · ${done}/${hb.targetPerWeek || 7} this week`]),
        h('div', { class: 'habit-week', style: { marginTop: '8px' } },
          week.map((d) => h('i', {
            class: (hb.history[d] ? 'done ' : '') + (d === iso ? 'today' : ''),
            onclick: () => store.toggleHabit(hb.id, d)
          }, [dowShort(d)]))
        )
      ]),
      h('button', {
        class: `toggle${hb.history[iso] ? ' on' : ''}`,
        onclick: () => store.toggleHabit(hb.id, iso),
        'aria-label': 'Toggle today'
      }, [h('span', { html: hb.history[iso] ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>' })])
    ]);
    list.appendChild(row);
  }

  root.replaceChildren(header, list);
}

function openAddHabit() {
  const name   = h('input', { type: 'text', placeholder: 'Meditate' });
  const emoji  = h('input', { type: 'text', placeholder: '🧘', maxlength: 2 });
  const target = h('input', { type: 'number', placeholder: '5', inputmode: 'numeric', value: 5 });
  const form = h('div', { class: 'form' }, [
    h('div', { class: 'field' }, [h('label', {}, ['Name']), name]),
    h('div', { class: 'field' }, [h('label', {}, ['Emoji']), emoji]),
    h('div', { class: 'field' }, [h('label', {}, ['Target per week']), target]),
    h('div', { class: 'row', style: { gap: '10px', marginTop: '6px' } }, [
      h('div', { style: { flex: 1 } }),
      h('button', { class: 'btn ghost', onclick: () => closeSheet() }, ['Cancel']),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          if (!name.value.trim()) return toast('Name required');
          store.addHabit({ name: name.value.trim(), emoji: emoji.value || '⭐', targetPerWeek: Number(target.value) || 3 });
          closeSheet();
        }
      }, ['Add'])
    ])
  ]);
  openSheet(h('div', {}, [h('h3', {}, ['New habit']), form]));
}
