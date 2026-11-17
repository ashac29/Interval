# interval

> Protein tea that fits your day. *Tea that keeps up.*

A calm planner for a **hypothetical** ready-to-drink protein tea brand (academic project). It reads a read-only calendar, finds workouts and busy stretches, and suggests at most one or two convenient moments for a drink, with the reasons. Product specs, prices and caffeine values are configurable data and are **not verified**.

> **Hypothesis, not a result:** useful planning may improve subscription retention. Nothing here proves that.

## Status (read this first)

| | |
|---|---|
| Built & verified locally | Yes: typecheck, lint, 139 unit tests, production build, 24 browser journey checks |
| **Deployed to Vercel / hosted** | **No. Deployment is incomplete.** No Vercel, Supabase, Google, Anthropic or GitHub credentials were available (the provided `GH_TOKEN` is rejected by GitHub). A local build is not a hosted deployment. |
| Works with zero credentials | Yes: full demo mode (see below) |

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: demo works with it empty
npm run dev                  # http://localhost:3000  -> "Explore demo"
```

```bash
npm run check   # typecheck + lint + unit tests
npm run build && npm start -- -p 3100
npm run e2e     # browser journeys against BASE_URL (default http://localhost:3100)
```

## Live vs simulated

| Capability | Demo (no credentials) | Live (when configured) |
|---|---|---|
| Sign-in | not used | Supabase Auth (email+password, magic link) |
| Calendar | 12 fixture scenarios, labeled demo | Google Calendar, **read-only**, minimal scopes |
| AI (4 features) | deterministic mock, labeled "Demo AI" | Anthropic adapter (model via env), schema-validated |
| Reminders | simulated; "Run due reminders now" | durable job runner (`/api/jobs/run`) |
| Email | **preview only, never "sent"** | Resend adapter when configured |
| Orders / payment / shipments | always simulated | always simulated |
| Caffeine per can | illustrative demo numbers, labeled | **unknown** until operator sets verified values (suggestions blocked) |
| State | isolated per visitor (cookie id) | per user, RLS-protected |

## Architecture

- **Next.js 16 App Router, strict TypeScript, Tailwind 4, shadcn-style components (Radix), Zod 4, Vitest.** Fonts are self-hosted (`@fontsource-variable`), no remote assets.
- **Pure domain core** (`src/lib/domain`): time/DST, busy merging, classification, policy validation, candidate generation, ranking, recompute, actions, preferences, brief, commerce, reminders. It operates on a JSON `AppState`.
- **AI proposes → policy engine validates → user confirms.** Model output is Zod-validated, then re-validated by deterministic code. Titles are untrusted data.
- **Persistence** goes through `StateStore.mutate()` (`src/lib/store`): serialized per id (memory) or compare-and-set on `version` with retry (Supabase), so concurrent accepts cannot both pass the daily cap.
- **Deliberate adaptation of the suggested 15 tables:** runtime state is a versioned jsonb snapshot per user (`user_state`, owner-only RLS), plus operational tables (`profiles`, `calendar_connections`, `calendar_credentials`, `demo_sessions`, `feedback_events`). `user_state.next_job_at` indexes due reminders; `calendar_connections.next_sync_at` indexes syncs. Trade-off: simpler and atomic, but no per-entity SQL analytics; split into relational tables if you need that.

### The four AI features
1. **Event interpretation** (`domain/classify.ts`): overrides > remembered titles > keyword rules > cached LLM result > "needs confirmation". Instruction-like titles are forced to confirmation.
2. **Timing** (`candidates.ts`, `score.ts`, `learning.ts`): code generates slots; an inspectable score ranks them; reasons + versions stored. Per-user adaptation needs ≥3 observations, is shrunk and capped, and can never beat explicit settings.
3. **Weekly brief** (`brief.ts`): from the validated plan, grounding-checked, deterministic fallback.
4. **Natural-language preferences** (`prefs-nl.ts`): supported fields only, before/after preview, confirmation, undo, policy rejection, office days never inferred.

### Policy highlights
Max 2 drinks/day (cap, not target; completed + accepted count; truthful logging allowed beyond it). Caffeine ceiling default 400 mg (lower only), "tracked caffeine", **unknown ≠ 0 and fails validation**. Quiet hours, cutoff, stock, dietary (never claims compatibility without verified ingredient data; milk is an allergen). Planning timezone is explicit; device timezone never silently changes limits.

## Customizable decisions (where to change them)

| Decision | Location |
|---|---|
| Policy, thresholds, scoring weights, offsets, busy-day hours, retention, sync defaults, AI defaults | `src/config/policy.ts` |
| Products, ingredients, offers, prices, caffeine, demo illustrative values | `src/config/products.ts` |
| Verified caffeine (operator) | env `PRODUCT_CAFFEINE_JSON` |
| Design tokens (colors, fonts, radii, motion) | `src/app/tokens.css` |
| LLM provider/model | env `LLM_PROVIDER`, `LLM_MODEL`; `src/lib/ai/` |
| Job provider | `src/lib/jobs.ts` + `/api/jobs/run`; schedule in `vercel.json` |
| Email provider | env `EMAIL_PROVIDER`; `src/lib/adapters/email.ts`, `src/lib/mail.ts` |
| Calendar sync interval/horizon | env `CALENDAR_SYNC_INTERVAL_MINUTES`, `CALENDAR_PAST_DAYS`, `CALENDAR_FUTURE_DAYS` |
| Caffeine guidance source URL | `policy.caffeine.guidance` (**verify the exact AHA page**; it currently links to the publisher home) |

A Claude Code subscription is **not** application API credentials; the app needs its own `ANTHROPIC_API_KEY`.

## Remaining setup to go live (exact steps)

1. **GitHub**: authenticate (`gh auth login`), create a repo, push this directory.
2. **Supabase**: create two projects (production, preview). Run `supabase/migrations/*.sql` in order (SQL editor or `supabase db push`). Auth → URL Configuration: Site URL = your Vercel URL; add `https://<domain>/auth/callback` (and the preview pattern) to Redirect URLs.
3. **Google Cloud**: OAuth client (Web). Enable the Calendar API. Scopes: `calendar.calendarlist.readonly`, `calendar.events.readonly`. Authorized redirect URI **exactly**: `https://<domain>/api/calendar/google/callback` (one per environment). While in "Testing", only listed test users can connect and refresh tokens expire after 7 days; sensitive-scope verification is required for public use.
4. **Vercel**: import the repo; set env vars from `.env.example` (separate values for Production and Preview). Generate secrets: `openssl rand -base64 32` for `TOKEN_ENCRYPTION_KEY`, `openssl rand -hex 32` for `OAUTH_STATE_SECRET` and `CRON_SECRET`. Set `DEMO_STORE=supabase` so demo state survives serverless instances (in-memory demo state is per-instance).
5. **Jobs**: `vercel.json` calls `/api/jobs/run` once a day (08:00 UTC; Vercel Hobby only allows daily crons) with `Authorization: Bearer $CRON_SECRET`. A daily tick means reminders and calendar syncs are NOT timely. For real reminders use a Pro plan with a sub-daily schedule (e.g. `*/10 * * * *`), or point another scheduler (GitHub Actions, Supabase pg_cron + pg_net) at the endpoint.
6. **Email** (optional): set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (verified sender domain).
7. Verify: `GET /api/health` lists configured integrations; run `npm run e2e` with `BASE_URL` set to the deployed URL.

## Data, security, retention
- RLS on all user-owned tables; `calendar_credentials` and `demo_sessions` have **no** client access. Refresh tokens are AES-256-GCM encrypted server-side. OAuth state is HMAC-signed, user-bound, 10-minute, single-use via nonce cookie.
- Calendar import: title, start/end, timezone, availability/status, provider ids, recurrence ids. **Never** descriptions or attendees (only your own response is reduced to a flag). Window: previous 7 / next 14 days, pruned each sync.
- Models receive one sanitized title, your typed request, or a plan summary. No prompts or titles in routine logs.
- Account deletion cascades through all tables; "Delete imported data", disconnect (revokes where supported) and data export are in Account. See `/privacy`.

## Tests
`npm run test` covers: drink cap (including concurrent acceptance), caffeine totals/unknowns, planned→consumed, daily/DST/timezone boundaries, busy merging, calendar updates and invalidation, manual-edit preservation, consumption idempotency/undo, reminder cancellation/dedupe/retry/quiet hours, malformed LLM output, prompt injection, policy-conflicting preference requests, learning safeguards, all 12 demo fixtures, Google sync (pagination, sync-token rules, 410, auth failure, retention, no descriptions/attendees), OAuth state, crypto, and **RLS isolation** (PGlite with a stubbed Supabase auth schema).

## Not verified / known gaps
- Nothing ran against real Supabase, Google, Anthropic or Resend. Those paths are covered by mocks/PGlite only.
- RLS was tested on PGlite with hand-made roles imitating Supabase, not on a hosted project.
- Live per-user persistence uses the snapshot design above rather than the 15 relational tables.
- AHA guidance URL and all product facts need real verification before any public use.
- Accessibility was checked by construction (contrast computed, focus rings, labels, reduced motion), not with an automated audit or screen reader.
