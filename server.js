const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '';

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (!FRONTEND_ORIGIN || FRONTEND_ORIGIN === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

const sessions = new Map();

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(cookieHeader.split(';').map(c => c.trim()).filter(Boolean).map(c => {
    const i = c.indexOf('=');
    return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
  }));
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let sid = cookies.sid;
  if (!sid || !sessions.has(sid)) {
    sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, {});
    const isHttps = BASE_URL.startsWith('https://');
    const sameSite = isHttps ? 'None' : 'Lax';
    const secure = isHttps ? '; Secure' : '';
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=${sameSite}${secure}`);
  }
  return sessions.get(sid);
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function postForm(url, params) {
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.error || 'OAuth token exchange failed');
  return data;
}

async function getJson(url, token) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || data.error || 'API request failed');
  return data;
}

function requireEnv(keys) {
  for (const key of keys) if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
}

function routeAuthStart(provider, req, res, session) {
  const state = crypto.randomBytes(16).toString('hex');
  session[`${provider}State`] = state;

  if (provider === 'microsoft') {
    requireEnv(['MS_CLIENT_ID', 'MS_CLIENT_SECRET']);
    const redirectUri = `${BASE_URL}/auth/microsoft/callback`;
    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.search = new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: 'openid profile email offline_access User.Read Calendars.Read', state }).toString();
    return redirect(res, authUrl.toString());
  }

  requireEnv(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  const redirectUri = `${BASE_URL}/auth/google/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, scope: 'openid email profile https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state }).toString();
  return redirect(res, authUrl.toString());
}

async function routeAuthCallback(provider, req, res, session, query) {
  if (query.state !== session[`${provider}State`]) throw new Error('Invalid OAuth state');
  if (query.error) throw new Error(query.error);

  if (provider === 'microsoft') {
    const redirectUri = `${BASE_URL}/auth/microsoft/callback`;
    const token = await postForm('https://login.microsoftonline.com/common/oauth2/v2.0/token', { client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, grant_type: 'authorization_code', code: query.code, redirect_uri: redirectUri });
    const profile = await getJson('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', token.access_token);
    session.microsoft = { token: token.access_token, email: profile.mail || profile.userPrincipalName };
    return redirect(res, '/calendar-sync.html?connected=microsoft');
  }

  const redirectUri = `${BASE_URL}/auth/google/callback`;
  const token = await postForm('https://oauth2.googleapis.com/token', { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: 'authorization_code', code: query.code, redirect_uri: redirectUri });
  const profile = await getJson('https://www.googleapis.com/oauth2/v2/userinfo', token.access_token);
  session.google = { token: token.access_token, email: profile.email };
  return redirect(res, '/calendar-sync.html?connected=google');
}

async function routeSync(req, res, session) {
  if (!session.microsoft?.token || !session.google?.token) return sendJson(res, 400, { error: 'Connect both Microsoft and Google first.' });

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startDateTime = now.toISOString();
  const endDateTime = in7d.toISOString();

  const msEvents = await getJson(`https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$select=subject,bodyPreview,start,end,location,isCancelled`, session.microsoft.token);

  let imported = 0;
  for (const event of msEvents.value || []) {
    if (event.isCancelled) continue;
    const payload = {
      summary: event.subject || 'Work meeting',
      description: event.bodyPreview || 'Synced from Outlook/Teams',
      location: event.location?.displayName || '',
      start: { dateTime: event.start?.dateTime, timeZone: event.start?.timeZone || 'UTC' },
      end: { dateTime: event.end?.dateTime, timeZone: event.end?.timeZone || 'UTC' }
    };

    const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.google.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (resp.ok) imported += 1;
  }

  sendJson(res, 200, { imported });
}

const server = http.createServer(async (req, res) => {
  try {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, BASE_URL);
    const session = getSession(req, res);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/calendar-sync.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'public/calendar-sync.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/auth/status') {
      return sendJson(res, 200, {
        microsoft: { connected: !!session.microsoft, email: session.microsoft?.email || null },
        google: { connected: !!session.google, email: session.google?.email || null }
      });
    }

    if (req.method === 'GET' && url.pathname === '/auth/config') {
      return sendJson(res, 200, {
        microsoftReady: !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET),
        googleReady: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        baseUrl: BASE_URL
      });
    }

    if (req.method === 'GET' && url.pathname === '/auth/microsoft') return routeAuthStart('microsoft', req, res, session);
    if (req.method === 'GET' && url.pathname === '/auth/google') return routeAuthStart('google', req, res, session);
    if (req.method === 'GET' && url.pathname === '/auth/microsoft/callback') return await routeAuthCallback('microsoft', req, res, session, Object.fromEntries(url.searchParams));
    if (req.method === 'GET' && url.pathname === '/auth/google/callback') return await routeAuthCallback('google', req, res, session, Object.fromEntries(url.searchParams));
    if (req.method === 'POST' && url.pathname === '/sync') return await routeSync(req, res, session);

    res.writeHead(404);
    res.end('Not found');
  } catch (error) {
    if (req.url.startsWith('/auth/')) return redirect(res, `/calendar-sync.html?error=${encodeURIComponent(error.message)}`);
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Calendar Bridge listening on ${BASE_URL}`);
});
