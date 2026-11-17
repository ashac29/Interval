-- No seed users: demo data is generated per visitor by the app and never stored here by default.
create or replace function public.purge_expired_demo_sessions() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.demo_sessions where expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_expired_demo_sessions() from public, anon, authenticated;
grant execute on function public.purge_expired_demo_sessions() to service_role;
