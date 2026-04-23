import { $, $$, debounce, toast } from './src/util.js';
import { store } from './src/store.js';
import { initCloud } from './src/cloud.js';
import { handleRedirect } from './src/strava.js';
import { renderDashboard } from './src/views/dashboard.js';
import { renderActivity  } from './src/views/activity.js';
import { renderHabits    } from './src/views/habits.js';
import { renderTrends    } from './src/views/trends.js';
import { renderSettings, setSettingsCloud } from './src/views/settings.js';

const views = {
  dashboard: renderDashboard,
  activity:  renderActivity,
  habits:    renderHabits,
  trends:    renderTrends,
  settings:  renderSettings
};

let current = 'dashboard';
let currentUser = null;
let cloud = null;

function render() {
  const root = $('#app');
  if (!root) return;
  (views[current] || renderDashboard)(root);
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === current));
}

function navigate(tab) {
  if (!views[tab]) tab = 'dashboard';
  current = tab;
  if (location.hash !== `#${tab}`) history.replaceState({}, '', `#${tab}`);
  render();
}

async function boot() {
  let cfg = {};
  try { cfg = await import('./config.js'); } catch { cfg = {}; }
  const firebaseConfig = cfg.firebaseConfig || {};
  const stravaConfig   = cfg.stravaConfig   || {};

  if (stravaConfig.clientId && !store.get().strava.clientId) {
    store.setStravaCreds(stravaConfig.clientId, stravaConfig.clientSecret || '');
  }

  cloud = await initCloud(firebaseConfig);
  setSettingsCloud(cloud, () => currentUser);

  const debouncedPush = debounce((state) => {
    if (currentUser && cloud.isReal) cloud.push(currentUser.uid, state).catch(() => {});
  }, 1500);
  store.bindCloudPush(debouncedPush);

  cloud.onUser(async (user) => {
    currentUser = user;
    if (user && cloud.isReal) {
      cloud.subscribe(user.uid, (remote) => store.mergeRemote(remote));
      cloud.push(user.uid, store.get()).catch(() => {});
    }
    render();
  });

  try {
    const res = await handleRedirect(location.origin + location.pathname);
    if (res) toast('Strava connected');
  } catch (e) {
    toast(e.message || 'Strava auth error');
  }

  store.on(() => render());

  $('#tabBar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    navigate(btn.dataset.tab);
  });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));

  navigate(location.hash.slice(1) || 'dashboard');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#ff3b55;padding:20px;white-space:pre-wrap">Boot failed: ${e?.message || e}</pre>`;
});
