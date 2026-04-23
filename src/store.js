import { todayISO, uid } from './util.js';

const LS_KEY = 'kevu.v1';

const defaultState = () => ({
  profile: { name: 'Mattia', email: '' },
  goals: { move: 620, exercise: 60, stand: 12, steps: 10000, sleep: 8 },
  workouts: [],
  habits: [
    { id: uid(), name: 'Run',          emoji: '🏃', targetPerWeek: 4, history: {} },
    { id: uid(), name: 'Strength',     emoji: '💪', targetPerWeek: 3, history: {} },
    { id: uid(), name: 'Stretching',   emoji: '🧘', targetPerWeek: 5, history: {} },
    { id: uid(), name: 'Water 2L',     emoji: '💧', targetPerWeek: 7, history: {} }
  ],
  daily: {},
  strava: { clientId: '', clientSecret: '', accessToken: '', refreshToken: '', expiresAt: 0, lastSync: 0 },
  updatedAt: 0
});

function merge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(out[k], v);
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    return merge(defaultState(), JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

const listeners = new Set();
let state = load();
let _cloudPush = null;

function persist() {
  state.updatedAt = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  listeners.forEach((fn) => { try { fn(state); } catch {} });
  if (_cloudPush) _cloudPush(state);
}

export const store = {
  get: () => state,

  on(fn)  { listeners.add(fn);  return () => listeners.delete(fn); },
  off(fn) { listeners.delete(fn); },

  patch(mut) {
    state = merge(state, mut);
    persist();
  },

  replace(next) {
    state = merge(defaultState(), next || {});
    persist();
  },

  bindCloudPush(fn) { _cloudPush = fn; },

  mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return;
    const localTs = state.updatedAt || 0;
    const remoteTs = remote.updatedAt || 0;
    if (remoteTs > localTs) {
      state = merge(defaultState(), remote);
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      listeners.forEach((fn) => { try { fn(state); } catch {} });
    } else if (remoteTs < localTs && _cloudPush) {
      _cloudPush(state);
    }
  },

  addWorkout(w) {
    const workout = {
      id: w.id || uid(),
      type: w.type || 'Other',
      date: w.date || todayISO(),
      durationMin: Number(w.durationMin) || 0,
      distanceM: Number(w.distanceM) || 0,
      calories: Number(w.calories) || 0,
      notes: w.notes || '',
      source: w.source || 'manual',
      strava_id: w.strava_id || null,
      startedAt: w.startedAt || null
    };
    state.workouts = [workout, ...state.workouts.filter((x) => x.id !== workout.id)];
    const day = state.daily[workout.date] ||= { steps: 0, sleepHours: 0, hr: [] };
    day.moveKcal = (day.moveKcal || 0) + workout.calories;
    day.exerciseMin = (day.exerciseMin || 0) + workout.durationMin;
    persist();
    return workout;
  },

  removeWorkout(id) {
    state.workouts = state.workouts.filter((w) => w.id !== id);
    persist();
  },

  mergeStravaActivities(list) {
    const byStravaId = new Map(state.workouts.filter((w) => w.strava_id).map((w) => [w.strava_id, w]));
    let added = 0, updated = 0;
    for (const w of list) {
      if (byStravaId.has(w.strava_id)) {
        const cur = byStravaId.get(w.strava_id);
        Object.assign(cur, w, { id: cur.id });
        updated++;
      } else {
        state.workouts.unshift({ id: uid(), ...w });
        added++;
      }
    }
    state.workouts.sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')));
    state.strava.lastSync = Date.now();
    persist();
    return { added, updated };
  },

  toggleHabit(habitId, dateIso) {
    const habit = state.habits.find((x) => x.id === habitId);
    if (!habit) return;
    habit.history[dateIso] = !habit.history[dateIso];
    if (!habit.history[dateIso]) delete habit.history[dateIso];
    persist();
  },

  addHabit({ name, emoji, targetPerWeek }) {
    state.habits.push({ id: uid(), name, emoji: emoji || '⭐', targetPerWeek: Number(targetPerWeek) || 3, history: {} });
    persist();
  },

  removeHabit(id) {
    state.habits = state.habits.filter((h) => h.id !== id);
    persist();
  },

  setGoal(key, val) {
    state.goals[key] = Number(val) || 0;
    persist();
  },

  setProfile(p) {
    state.profile = { ...state.profile, ...p };
    persist();
  },

  setStravaTokens(t) {
    state.strava = { ...state.strava, ...t };
    persist();
  },

  setStravaCreds(clientId, clientSecret) {
    state.strava.clientId = clientId;
    state.strava.clientSecret = clientSecret;
    persist();
  },

  setDaily(dateIso, patch) {
    state.daily[dateIso] = { ...(state.daily[dateIso] || {}), ...patch };
    persist();
  },

  exportJSON() {
    return JSON.stringify(state, null, 2);
  },

  importJSON(text) {
    const obj = JSON.parse(text);
    state = merge(defaultState(), obj);
    persist();
  },

  wipe() {
    state = defaultState();
    localStorage.removeItem(LS_KEY);
    persist();
  }
};
