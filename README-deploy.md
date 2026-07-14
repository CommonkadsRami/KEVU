# Deploying Axon (with the live AI features)

The landing page is a single static file (`index.html`) plus one serverless
function (`api/claude.js`) that powers the two live-AI moments:

- the **hero scope generator** ("describe your workflow → get a 3-week scope"), and
- the **Ask Axon chat widget** (bottom-right).

Everything else on the page (aurora background, pillar demos, eval ticker,
case-study picker) runs entirely in the browser with no backend. If you deploy
the static file *without* the function, the page still works — the two live-AI
features just show a graceful "book a call" fallback instead of streaming.

---

## 1. Prerequisites

- An [Anthropic API key](https://console.anthropic.com/) (starts with `sk-ant-…`).
- A free [Vercel](https://vercel.com) account.
- The Vercel CLI: `npm i -g vercel`

## 2. Deploy

From the repo root:

```bash
vercel            # first run: link/create the project, accept defaults
vercel --prod     # promote to production
```

Vercel auto-detects `api/claude.js` as an Edge Function (config is in
`vercel.json`). No build step, no framework — it just serves `index.html` and
the function.

## 3. Set the API key

```bash
vercel env add ANTHROPIC_API_KEY
# paste your sk-ant-… key, choose "Production" (and Preview if you want)
vercel --prod     # redeploy so the new env var is picked up
```

## 4. Lock down CORS (recommended)

Open `api/claude.js` and set `ALLOWED_ORIGINS` to your real domain(s):

```js
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://www.your-domain.com',
];
```

Redeploy. This stops other sites from calling your endpoint on your dime.

## 5. Point the frontend at the function (only if needed)

By default the page calls a **same-origin** path (`/api/claude`), so if the
page and the function are on the same Vercel deployment, there is nothing to
change.

If you host the HTML somewhere else (e.g. a marketing CDN) and only the
function on Vercel, set the endpoint once near the top of the `<script>` block
in `index.html`:

```js
window.AXON_API_BASE = 'https://your-vercel-app.vercel.app';
```

The frontend uses `${window.AXON_API_BASE || ''}/api/claude` for every call
(and `/api/lead` for the email-capture form).

---

## 6. Lead capture (optional — Supabase)

The CTA has an email-capture form ("Not ready to talk? Get our 1-page
overview") backed by `api/lead.js`, which writes to a Supabase table. Without
Supabase configured, the form shows a friendly error; everything else works.

**a. Create the table.** In your Supabase project's SQL Editor, run
`supabase/migrations/0001_leads.sql` (or `supabase db push` if you use the
CLI). It creates a `leads` table, a unique index on the email, and enables RLS
with **no public policies** — the table is not reachable via the anon key.

**b. Set two Vercel env vars** (the service-role key bypasses RLS and must stay
server-side — never put it in the frontend):

```bash
vercel env add SUPABASE_URL                # https://xxxx.supabase.co
vercel env add SUPABASE_SERVICE_ROLE_KEY   # Project Settings → API → service_role secret
vercel --prod                              # redeploy to pick them up
```

**c. Lock CORS** in `api/lead.js` too (same `ALLOWED_ORIGINS` as `api/claude.js`).

Leads land in the `leads` table (`select * from leads order by created_at desc`).
The function validates the email, honours a honeypot field, dedupes by email,
and rate-limits to 10/hour per IP.

---

## Cost expectations

Both features use **Claude Haiku**, the fastest/cheapest model. A curious
visitor who generates a scope and asks a few chat questions costs a fraction of
a cent. The function also rate-limits to **20 requests/hour per IP** (see
`RATE_LIMIT` in `api/claude.js`) so a single abuser can't run up a bill. For
hard guarantees under real traffic, back the rate limiter with
[Vercel KV](https://vercel.com/docs/storage/vercel-kv) or Upstash instead of the
in-memory map.

## Troubleshooting

- **Features show the fallback message immediately** → the `ANTHROPIC_API_KEY`
  env var isn't set, or you didn't redeploy after adding it.
- **CORS error in console** → add your domain to `ALLOWED_ORIGINS` and redeploy.
- **429 / "hit the demo limit"** → the per-IP rate limit; expected behaviour.
