-- Interval: initial schema.
-- DELIBERATE ADAPTATION of the spec's suggested 15-table list: the application's domain state
-- (preferences, calendar events, recommendations, consumption, inventory, orders, reminders, ...)
-- is persisted as ONE versioned jsonb snapshot per user (user_state). Optimistic concurrency on
-- `version` serializes concurrent actions, so policy validation (daily cap etc.) runs on fresh state.
-- Operational tables that must be queried across users or kept away from clients stay relational.
-- Retention: calendar events live inside the snapshot and are pruned to the import window
-- (default past 7 / future 14 days) by app code on every sync. Deleting an auth user cascades to
-- every table below (privacy deletion).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account. Minimal identity data.';

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  version integer not null default 0,
  next_job_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.user_state is 'Versioned jsonb snapshot of AppState. Written with compare-and-set on version. next_job_at lets the job runner find users with due reminders.';
create index if not exists user_state_next_job_at_idx on public.user_state (next_job_at) where next_job_at is not null;

create table if not exists public.calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google',
  status text not null default 'not_connected',
  calendars jsonb not null default '[]'::jsonb,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  sync_interval_minutes integer not null default 60,
  last_error text,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now()
);
comment on table public.calendar_connections is 'Non-secret connection status and sync scheduling. No tokens here.';
create index if not exists calendar_connections_next_sync_idx on public.calendar_connections (next_sync_at) where next_sync_at is not null;

create table if not exists public.calendar_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_enc text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);
comment on table public.calendar_credentials is 'Encrypted OAuth refresh tokens. Service role only; no client policies.';

create table if not exists public.demo_sessions (
  id text primary key,
  state jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);
comment on table public.demo_sessions is 'Optional production store for isolated per-visitor demo state. Service role only.';

create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  rec_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.feedback_events is 'Append-only instrumentation mirror. Owners may insert/select, never update/delete (undo = compensating event).';
create index if not exists feedback_events_user_idx on public.feedback_events (user_id, created_at);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
