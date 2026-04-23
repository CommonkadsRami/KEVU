import { h, openSheet, closeSheet, toast } from '../util.js';
import { store } from '../store.js';
import * as strava from '../strava.js';

let cloudRef = null;
let userRef  = null;
export function setSettingsCloud(cloud, getUser) { cloudRef = cloud; userRef = getUser; }

export function renderSettings(root) {
  const s = store.get();
  const user = userRef ? userRef() : null;
  const cloudReady = !!(cloudRef && cloudRef.isReal);

  root.replaceChildren(
    h('header', { class: 'page-header' }, [
      h('div', {}, [
        h('div', { class: 'date-line' }, ['Settings']),
        h('div', { class: 'greeting' }, ['Account, Strava, Goals'])
      ])
    ]),

    accountCard(cloudReady, user),
    stravaCard(),
    goalsCard(s.goals),
    profileCard(s.profile),
    dataCard()
  );
}

function accountCard(cloudReady, user) {
  if (!cloudReady) {
    return h('section', { class: 'card' }, [
      h('div', { class: 'card-title' }, ['Account']),
      h('p', { class: 'small', style: { marginTop: '8px' } }, [
        'Cloud sign-in is disabled because ', h('code', {}, ['config.js']), ' is not set. Copy ',
        h('code', {}, ['config.example.js']), ' to ', h('code', {}, ['config.js']),
        ' and paste your Firebase config to enable Apple / Google / email login and cross-device sync.'
      ])
    ]);
  }

  if (user) {
    return h('section', { class: 'card' }, [
      h('div', { class: 'card-title' }, ['Account']),
      h('div', { class: 'row', style: { marginTop: '10px', gap: '12px' } }, [
        h('div', { class: 'avatar' }, [(user.displayName || user.email || '?').slice(0, 1).toUpperCase()]),
        h('div', {}, [
          h('div', { style: { fontWeight: '800' } }, [user.displayName || 'Signed in']),
          h('div', { class: 'small' }, [user.email || ''])
        ]),
        h('div', { style: { flex: 1 } }),
        h('button', { class: 'btn small', onclick: () => cloudRef.signOut().then(() => toast('Signed out')) }, ['Sign out'])
      ])
    ]);
  }

  return h('section', { class: 'card' }, [
    h('div', { class: 'card-title' }, ['Sign in']),
    h('div', { style: { display: 'grid', gap: '10px', marginTop: '10px' } }, [
      h('button', { class: 'btn block', onclick: () => signInWith('google') }, ['Continue with Google']),
      h('button', { class: 'btn block', onclick: () => signInWith('apple')  }, ['Continue with Apple']),
      h('button', { class: 'btn block primary', onclick: openEmailSheet }, ['Continue with email'])
    ]),
    h('p', { class: 'small', style: { marginTop: '10px' } }, [
      'Your data syncs across devices once signed in.'
    ])
  ]);
}

async function signInWith(provider) {
  try {
    if (provider === 'google') await cloudRef.signInGoogle();
    else if (provider === 'apple') await cloudRef.signInApple();
    toast('Signed in');
  } catch (e) {
    toast(e.message || 'Sign-in failed');
  }
}

function openEmailSheet(mode = 'signin') {
  const email = h('input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
  const pass  = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
  const title = h('h3', {}, [mode === 'signup' ? 'Create account' : 'Sign in']);

  const primary = h('button', {
    class: 'btn primary', onclick: async () => {
      try {
        if (mode === 'signup') await cloudRef.signUpEmail(email.value.trim(), pass.value);
        else                   await cloudRef.signInEmail(email.value.trim(), pass.value);
        closeSheet();
        toast('Welcome');
      } catch (e) { toast(prettyAuthError(e)); }
    }
  }, [mode === 'signup' ? 'Create' : 'Sign in']);

  const swap = h('button', {
    class: 'btn ghost small', onclick: () => {
      closeSheet();
      openEmailSheet(mode === 'signup' ? 'signin' : 'signup');
    }
  }, [mode === 'signup' ? 'Have an account? Sign in' : 'New? Create account']);

  const reset = h('button', {
    class: 'btn ghost small', onclick: async () => {
      if (!email.value) return toast('Enter your email first');
      try { await cloudRef.sendReset(email.value.trim()); toast('Reset email sent'); }
      catch (e) { toast(prettyAuthError(e)); }
    }
  }, ['Forgot password?']);

  openSheet(h('div', {}, [
    title,
    h('div', { class: 'form' }, [
      h('div', { class: 'field' }, [h('label', {}, ['Email']), email]),
      h('div', { class: 'field' }, [h('label', {}, ['Password']), pass]),
      h('div', { class: 'row', style: { gap: '10px' } }, [reset, h('div', { style: { flex: 1 } }), swap, primary])
    ])
  ]));
}

function prettyAuthError(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password')) return 'Wrong email or password';
  if (c.includes('user-not-found')) return 'No account with that email';
  if (c.includes('email-already-in-use')) return 'Email already in use';
  if (c.includes('weak-password')) return 'Password too weak (min 6 chars)';
  return e?.message || 'Auth failed';
}

function stravaCard() {
  const s = store.get().strava;
  const connected = strava.isConnected();
  const lastSync = s.lastSync ? new Date(s.lastSync).toLocaleString() : '—';

  const idInput  = h('input', { type: 'text', placeholder: '123456', value: s.clientId || '' });
  const sec      = h('input', { type: 'password', placeholder: 'Client Secret', value: s.clientSecret || '' });

  return h('section', { class: 'card strava-card' }, [
    h('div', { class: 'card-title' }, ['Strava']),
    h('div', { class: 'strava-status', style: { marginTop: '6px' } }, [
      h('span', { class: `status-dot ${connected ? 'on' : 'off'}` }),
      h('span', { class: 'small' }, [connected ? `Connected · Last sync ${lastSync}` : 'Not connected'])
    ]),
    h('div', { class: 'form', style: { marginTop: '12px' } }, [
      h('div', { class: 'field' }, [h('label', {}, ['Client ID']), idInput]),
      h('div', { class: 'field' }, [h('label', {}, ['Client Secret']), sec]),
      h('div', { class: 'row', style: { gap: '10px' } }, [
        h('button', {
          class: 'btn small', onclick: () => {
            store.setStravaCreds(idInput.value.trim(), sec.value.trim());
            toast('Saved');
          }
        }, ['Save']),
        h('div', { style: { flex: 1 } }),
        connected
          ? h('button', { class: 'btn small', onclick: async () => {
              try { const r = await strava.syncNow(); toast(`Synced · +${r.added}`); } catch (e) { toast(e.message); }
            } }, ['Sync now'])
          : null,
        connected
          ? h('button', { class: 'btn small danger', onclick: () => { strava.disconnect(); toast('Disconnected'); } }, ['Disconnect'])
          : h('button', {
              class: 'btn small primary',
              onclick: () => {
                store.setStravaCreds(idInput.value.trim(), sec.value.trim());
                try { strava.connect(location.origin + location.pathname); }
                catch (e) { toast(e.message); }
              }
            }, ['Connect Strava'])
      ]),
      h('p', { class: 'small' }, [
        'Create a Strava app at ', h('a', { href: 'https://www.strava.com/settings/api', target: '_blank', rel: 'noopener' }, ['strava.com/settings/api']),
        '. Set "Authorization Callback Domain" to ', h('code', {}, [location.host || 'localhost']), '.'
      ])
    ])
  ]);
}

function goalsCard(goals) {
  const mk = (key, label, suffix = '') => {
    const input = h('input', { type: 'number', inputmode: 'numeric', value: goals[key] });
    input.addEventListener('change', () => store.setGoal(key, input.value));
    return h('div', { class: 'field' }, [h('label', {}, [`${label}${suffix}`]), input]);
  };
  return h('section', { class: 'card' }, [
    h('div', { class: 'card-title' }, ['Daily goals']),
    h('div', { class: 'form', style: { marginTop: '10px' } }, [
      mk('move', 'Move', ' (kcal)'),
      mk('exercise', 'Exercise', ' (min)'),
      mk('stand', 'Stand', ' (hours)'),
      mk('steps', 'Steps', ''),
      mk('sleep', 'Sleep', ' (hours)')
    ])
  ]);
}

function profileCard(profile) {
  const name = h('input', { type: 'text', value: profile.name || '' });
  name.addEventListener('change', () => store.setProfile({ name: name.value }));
  return h('section', { class: 'card' }, [
    h('div', { class: 'card-title' }, ['Profile']),
    h('div', { class: 'form', style: { marginTop: '10px' } }, [
      h('div', { class: 'field' }, [h('label', {}, ['Display name']), name])
    ])
  ]);
}

function dataCard() {
  return h('section', { class: 'card' }, [
    h('div', { class: 'card-title' }, ['Data']),
    h('div', { class: 'row', style: { gap: '10px', marginTop: '10px', flexWrap: 'wrap' } }, [
      h('button', {
        class: 'btn small', onclick: () => {
          const blob = new Blob([store.exportJSON()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `kevu-export-${Date.now()}.json` });
          a.click(); URL.revokeObjectURL(a.href);
        }
      }, ['Export JSON']),
      h('label', { class: 'btn small' }, [
        'Import JSON',
        h('input', {
          type: 'file', accept: 'application/json', style: { display: 'none' },
          onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            try { store.importJSON(await f.text()); toast('Imported'); }
            catch (err) { toast('Invalid file'); }
          }
        })
      ]),
      h('button', {
        class: 'btn small danger', onclick: () => {
          if (confirm('Wipe all local KEVU data on this device?')) { store.wipe(); toast('Wiped'); }
        }
      }, ['Wipe local'])
    ])
  ]);
}
