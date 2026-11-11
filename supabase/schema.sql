-- Gym Tracker cloud schema. Run once in Supabase → SQL Editor.
-- Every table is private to the signed-in user via row level security.

create table if not exists public.workouts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.weigh_ins (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  weight numeric not null,
  body_fat numeric,
  source text not null default 'manual',
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.measurements (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workouts enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.measurements enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own rows" on public.workouts;
drop policy if exists "own rows" on public.weigh_ins;
drop policy if exists "own rows" on public.measurements;
drop policy if exists "own rows" on public.settings;

create policy "own rows" on public.workouts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.weigh_ins for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.measurements for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
