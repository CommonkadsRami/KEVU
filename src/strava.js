import { store } from './store.js';

const AUTH_URL  = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_URL   = 'https://www.strava.com/api/v3';

const SPORT_TO_TYPE = {
  Run: 'Run', TrailRun: 'Run', VirtualRun: 'Run',
  Ride: 'Ride', VirtualRide: 'Ride', EBikeRide: 'Ride', MountainBikeRide: 'Ride', GravelRide: 'Ride',
  Swim: 'Swim',
  Walk: 'Walk', Hike: 'Walk',
  WeightTraining: 'Strength', Workout: 'Strength', Crossfit: 'Strength',
  Yoga: 'Yoga',
  Rowing: 'Rowing'
};

function toWorkout(act) {
  const date = (act.start_date_local || act.start_date || '').slice(0, 10);
  return {
    type: SPORT_TO_TYPE[act.sport_type] || SPORT_TO_TYPE[act.type] || act.sport_type || 'Other',
    date,
    durationMin: Math.round((act.moving_time || act.elapsed_time || 0) / 60),
    distanceM: Math.round(act.distance || 0),
    calories: Math.round(act.calories || act.kilojoules || 0),
    notes: act.name || '',
    source: 'strava',
    strava_id: act.id,
    startedAt: act.start_date_local || act.start_date || null
  };
}

export function connect(redirectUri) {
  const { clientId } = store.get().strava;
  if (!clientId) throw new Error('Set your Strava Client ID in Settings first.');
  sessionStorage.setItem('kevu.strava.pending', '1');
  const params = new URLSearchParams({
    client_id: String(clientId),
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'auto',
    scope: 'read,activity:read_all'
  });
  location.assign(`${AUTH_URL}?${params.toString()}`);
}

export async function handleRedirect(redirectUri) {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const err  = url.searchParams.get('error');
  const pending = sessionStorage.getItem('kevu.strava.pending');
  if (!code && !err) return null;
  if (!pending) return null;
  sessionStorage.removeItem('kevu.strava.pending');

  url.searchParams.delete('code');
  url.searchParams.delete('scope');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash);

  if (err) throw new Error(`Strava auth denied: ${err}`);

  const { clientId, clientSecret } = store.get().strava;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code'
    })
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const tok = await res.json();
  store.setStravaTokens({
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: (tok.expires_at || 0) * 1000
  });
  return tok;
}

async function refreshIfNeeded() {
  const s = store.get().strava;
  if (!s.accessToken) throw new Error('Not connected to Strava.');
  if (s.expiresAt && s.expiresAt - 60_000 > Date.now()) return s.accessToken;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const tok = await res.json();
  store.setStravaTokens({
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: (tok.expires_at || 0) * 1000
  });
  return tok.access_token;
}

export async function fetchRecentActivities(perPage = 30) {
  const token = await refreshIfNeeded();
  const res = await fetch(`${API_URL}/athlete/activities?per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
  return res.json();
}

export async function syncNow() {
  const list = await fetchRecentActivities(30);
  return store.mergeStravaActivities(list.map(toWorkout));
}

export function disconnect() {
  store.setStravaTokens({ accessToken: '', refreshToken: '', expiresAt: 0 });
}

export function isConnected() {
  return !!store.get().strava.accessToken;
}
