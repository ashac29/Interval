# Supabase

- `migrations/` run in order (`supabase db push` or paste into the SQL editor). `seed.sql` adds `purge_expired_demo_sessions()`.
- Runtime state is a jsonb snapshot per user (`user_state`) with compare-and-set on `version`; operational tables (`calendar_connections`, `calendar_credentials`, `demo_sessions`, `feedback_events`) are relational. Credentials and demo tables have RLS on and no client policies (service role only).
- Account deletion: delete the `auth.users` row; everything cascades.
- `tests/rls.test.ts` proves isolation on PGlite with a stubbed `auth` schema.
