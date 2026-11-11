-- Google Health connection. Run once in Supabase → SQL Editor (after schema.sql).

-- OAuth tokens: row level security on, and NO policies, so only server functions
-- (service role) can read or write them. The app can never see a token.
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);
alter table public.google_tokens enable row level security;

-- Short-lived OAuth "state" values that tie Google's redirect back to the signed-in user.
create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;

-- Connection status the app may read (no secrets here).
create table if not exists public.integrations (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  primary key (user_id, provider)
);
alter table public.integrations enable row level security;
drop policy if exists "read own" on public.integrations;
create policy "read own" on public.integrations for select to authenticated using (auth.uid() = user_id);
