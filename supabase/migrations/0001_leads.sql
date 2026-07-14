-- Axon — lead capture table
-- Run this once in your Supabase project (SQL Editor, or `supabase db push`).
-- Writes happen ONLY through the api/lead.js edge function using the
-- service-role key, which bypasses RLS. We enable RLS with no public policies
-- so the table is not readable/writable via the anon/public key.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text,
  created_at  timestamptz not null default now()
);

-- Prevent duplicate emails (so ignore-duplicates in the function works).
create unique index if not exists leads_email_key on public.leads (lower(email));

-- Lock the table down: RLS on, no policies => no anon/public access.
alter table public.leads enable row level security;

-- (Intentionally no policies. The service-role key used server-side bypasses
--  RLS, so inserts from api/lead.js still succeed.)
