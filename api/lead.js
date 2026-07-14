// Axon — lead capture (Vercel Edge Function)
// -------------------------------------------------------------
// Inserts an email into a Supabase `leads` table using the
// service-role key (server-side only, never shipped to the client).
//
// Deploy:  see README-deploy.md.
// Requires env vars:
//   SUPABASE_URL                e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   (service_role secret — keep private)
// -------------------------------------------------------------

export const config = { runtime: 'edge' };

// Allowed origins for CORS. Add your production domain(s) after deploy.
const ALLOWED_ORIGINS = [
  'https://axon.dev',
  'https://www.axon.dev',
];

// Per-isolate rate limit — blunt abuse. Back with KV for hard guarantees.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: 'Lead capture is not configured yet.' }, 200, cors);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json({ error: "You've submitted a few times already — book a call and we'll follow up." }, 429, cors);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400, cors); }

  // Honeypot — if the hidden field is filled, silently accept without storing.
  if (body.company_url) return json({ ok: true }, 200, cors);

  const email = (body.email || '').toString().trim().toLowerCase().slice(0, 160);
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email.' }, 422, cors);

  const source = (body.source || 'web').toString().slice(0, 40);

  let resp;
  try {
    resp = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal, resolution=ignore-duplicates',
      },
      body: JSON.stringify({ email, source }),
    });
  } catch {
    return json({ error: 'Could not save right now — please try again.' }, 502, cors);
  }

  // 201 created, or 200/204 with ignore-duplicates. Treat 409 as success too.
  if (resp.ok || resp.status === 409) return json({ ok: true }, 200, cors);

  return json({ error: 'Could not save right now — please try again.' }, 502, cors);
}
