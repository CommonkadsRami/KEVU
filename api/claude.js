// Axon — Claude API proxy (Vercel Edge Function)
// -------------------------------------------------------------
// Keeps the Anthropic API key server-side and streams responses
// (SSE) straight through to the browser. Two modes:
//   ?mode=scope  — single-turn hero "scope this workflow" generator
//   ?mode=chat   — multi-turn "Ask Axon" chat widget
//
// Deploy:  see README-deploy.md in the repo root.
// Requires env var: ANTHROPIC_API_KEY
// -------------------------------------------------------------

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Allowed origins for CORS. Add your production domain here after deploy.
const ALLOWED_ORIGINS = [
  'https://axon.dev',
  'https://www.axon.dev',
];

// In-memory rate limit (per edge isolate). Good enough to blunt casual abuse;
// for hard guarantees back this with Vercel KV / Upstash.
const RATE_LIMIT = 20;          // requests
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour
const hits = new Map();         // ip -> { count, resetAt }

const SYSTEM_PROMPTS = {
  scope: `You are Axon's scoping assistant. Axon is an AI-native delivery consultancy that builds production AI systems on Lovable, Claude Code and OpenClaw, then trains the client's team to run them.

Given a one-line description of a business workflow, respond with a realistic 3-week engagement scope and NOTHING else. Use exactly this format in plain markdown:

**Week 1 — Discover**
- <2-3 short bullets: what we'd map, who we'd talk to, the metric we'd anchor on>

**Week 2 — Build**
- <2-3 short bullets: the vertical slice we'd ship, where it lands (their repo), the eval/guardrail>

**Week 3 — Pilot**
- <2-3 short bullets: who tests it, what "good" looks like, the handover artefact>

Rules:
- Be concrete and specific to the described workflow. Reference real deliverables (opportunity map, eval harness, runbook, ADR pack).
- Keep each bullet under 15 words.
- Do not invent pricing, guarantees, or client names.
- If the input is empty, gibberish, or not a business workflow, reply with a single friendly line asking them to describe a workflow (e.g. "support ticket triage" or "monthly board report").
- Never answer questions unrelated to scoping an Axon engagement.`,

  chat: `You are "Ask Axon", the assistant on Axon's website. Axon is an AI-native delivery consultancy founded and led by Rami Achahbar (10 years enterprise delivery, ex-Accenture). Axon designs, builds, tests and runs production AI systems on Lovable, Claude Code and OpenClaw, then trains the client's team to operate them.

Key facts you can use:
- Engagement shape: 3 pillars — Discover (consultation, fit-gap), Build (design, build, test), Land (go-live, post go-live support).
- Typical timeline: Week 1 a working slice in the client's repo; Week 4 pilot live with internal users; Week 8 production + team trained.
- Ownership: everything ships into the client's repo, cloud and vendor accounts. No lock-in, they own the code and IP.
- Security: client's environment, tenancy and keys; NDAs/DPAs signed before data is shared; private model deployments for regulated workloads.
- Pricing: fixed price per phase, not open-ended T&M; an 8-week build is typically mid five figures; precise quote after a call. Do not commit to exact numbers.
- Week-2 kill switch: if the first slice isn't useful, the client can stop and only pay for time delivered.
- Booking: a free 30-min call at https://calendly.com/achahbar-rami/15min

Style: confident, concise, direct. 2-4 sentences per answer. Sound like a senior delivery lead, not a chatbot.

Rules:
- Only discuss Axon, its services, process, pricing shape, security posture, and how it could help the visitor's situation.
- If asked something off-topic (write code, tell a joke, general trivia), politely decline in one sentence and steer back to how Axon could help, then optionally suggest booking a call.
- Never invent case studies, client names, or specific guarantees. If you don't know, say so and suggest a call.`,
};

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
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

function errorStream(message) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`));
      controller.close();
    },
  });
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') === 'chat' ? 'chat' : 'scope';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(errorStream('Server is not configured yet.'), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream' },
    });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return new Response(errorStream("You've hit the demo limit for now — book a call and we'll scope it live."), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(errorStream('Bad request.'), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream' },
    });
  }

  // Build the messages array.
  let messages;
  if (mode === 'chat') {
    // Expect { messages: [{role, content}, ...] }
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    messages = incoming
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12) // cap history
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return new Response(errorStream('Say something first.'), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'text/event-stream' },
      });
    }
  } else {
    const workflow = (body.workflow || '').toString().slice(0, 400).trim();
    messages = [{ role: 'user', content: `Workflow: ${workflow || '(empty)'}` }];
  }

  const anthropicReq = {
    model: MODEL,
    max_tokens: mode === 'chat' ? 512 : 700,
    system: SYSTEM_PROMPTS[mode],
    messages,
    stream: true,
  };

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicReq),
    });
  } catch {
    return new Response(errorStream('Our scoping assistant is warming up — try again or book a call directly.'), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream' },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(errorStream('Our scoping assistant is warming up — try again or book a call directly.'), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream' },
    });
  }

  // Transform Anthropic's SSE into simple {text} / {done} frames the client understands.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const evt of events) {
            const line = evt.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try {
              const parsed = JSON.parse(json);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`));
              } else if (parsed.type === 'message_stop') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              }
            } catch {
              /* ignore keep-alive / non-JSON lines */
            }
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted — please retry.' })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
