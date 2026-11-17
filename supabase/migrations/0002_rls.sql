-- Row level security. Owner-only access via auth.uid(); secrets tables have NO client policies.
alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_credentials enable row level security;
alter table public.demo_sessions enable row level security;
alter table public.feedback_events enable row level security;

drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner on public.profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists user_state_owner on public.user_state;
create policy user_state_owner on public.user_state for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists calendar_connections_select on public.calendar_connections;
drop policy if exists calendar_connections_insert on public.calendar_connections;
drop policy if exists calendar_connections_update on public.calendar_connections;
drop policy if exists calendar_connections_delete on public.calendar_connections;
create policy calendar_connections_select on public.calendar_connections for select to authenticated using (auth.uid() = user_id);
create policy calendar_connections_insert on public.calendar_connections for insert to authenticated with check (auth.uid() = user_id);
create policy calendar_connections_update on public.calendar_connections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy calendar_connections_delete on public.calendar_connections for delete to authenticated using (auth.uid() = user_id);

-- Append-only: select + insert only.
drop policy if exists feedback_events_select on public.feedback_events;
drop policy if exists feedback_events_insert on public.feedback_events;
create policy feedback_events_select on public.feedback_events for select to authenticated using (auth.uid() = user_id);
create policy feedback_events_insert on public.feedback_events for insert to authenticated with check (auth.uid() = user_id);

-- Table privileges: least privilege on top of RLS.
revoke all on public.calendar_credentials, public.demo_sessions from anon, authenticated;
revoke all on public.profiles, public.user_state, public.calendar_connections, public.feedback_events from anon;
grant select, insert, update, delete on public.profiles, public.user_state, public.calendar_connections to authenticated;
revoke all on public.feedback_events from authenticated;
grant select, insert on public.feedback_events to authenticated;
grant all on all tables in schema public to service_role;
