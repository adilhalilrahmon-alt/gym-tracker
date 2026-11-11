-- Coach, notifications and scheduler. Run once in Supabase → SQL Editor (after schema.sql and google.sql).

-- Server-only values (cron secret, VAPID keys). RLS on, no policies.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (name, value)
values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Web Push subscriptions (one per device). Server only.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- One row per notification sent, so nothing is sent twice. Server only.
create table if not exists public.notification_log (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  day text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);
alter table public.notification_log enable row level security;

-- Coach notes. The app may read its own.
create table if not exists public.insights (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  kind text not null,           -- 'workout' | 'weekly'
  ref text,                     -- workout id or week start
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.insights enable row level security;
drop policy if exists "read own" on public.insights;
create policy "read own" on public.insights for select to authenticated using (auth.uid() = user_id);

-- Every 15 minutes, poke the server function so it can send reminders and write coach notes.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('gym-tracker-tick') where exists (select 1 from cron.job where jobname = 'gym-tracker-tick');
select cron.schedule(
  'gym-tracker-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xsgcqvqidvgzacmsdtqo.supabase.co/functions/v1/google-callback',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_secrets where name = 'cron')),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
