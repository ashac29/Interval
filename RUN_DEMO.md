# Run the interval demo locally

Requires Node.js 20.9+ (22 recommended) and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Explore demo**. No accounts, API keys or `.env` file are needed: the demo uses a deterministic mock AI, fixture calendars, preview-only email and simulated commerce.

Use the scenario menu in the demo bar to switch between the 12 fixtures.

Production-style run:

```bash
npm run build
npm start        # http://localhost:3000
```

Checks: `npm run check` (typecheck, lint, tests). Browser journeys: start the app, then `BASE_URL=http://localhost:3000 npm run e2e` (needs Playwright installed).

To enable live features (Supabase, Google Calendar, Anthropic, email), copy `.env.example` to `.env.local` and follow README.md.
