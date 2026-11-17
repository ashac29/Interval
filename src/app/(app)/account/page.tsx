import type { Metadata } from "next";
import Link from "next/link";
import { AccountPrefs } from "@/components/app/account-prefs";
import { CalendarActions, CalendarPicker, ForgetMapping, PrivacyActions } from "@/components/app/account-controls";
import { CaffeineGuidance } from "@/components/app/caffeine-note";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { aiStatus } from "@/lib/ai";
import { capabilities } from "@/lib/env";
import { pageData } from "@/lib/session";
import { prefsValues } from "@/lib/prefs-values";

export const metadata: Metadata = { title: "Account" };

const CAL_MSG: Record<string, { tone: "success" | "warning" | "error" | "info"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar connected (read-only). Your first import ran." },
  denied: { tone: "info", text: "Calendar access wasn’t granted. Nothing was connected." },
  invalid_state: { tone: "error", text: "That connection attempt couldn’t be verified (expired or tampered). Please try again." },
  failed: { tone: "error", text: "Couldn’t finish connecting. Please try again." },
  no_refresh_token: { tone: "warning", text: "Google didn’t return offline access. Remove interval from your Google account permissions and reconnect." },
  not_configured: { tone: "info", text: "Google Calendar isn’t configured on this server." },
  signin_required: { tone: "info", text: "Sign in with an account to connect a calendar." },
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  const sp = await searchParams;
  const { state, now } = await pageData();
  const caps = capabilities();
  const demo = state.mode === "demo";
  const cal = state.calendar;
  const ai = aiStatus(state.mode);
  const msg = sp.calendar ? CAL_MSG[sp.calendar] : null;
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: state.prefs.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "Never");
  void now;
  return (
    <div className="space-y-10">
      <header className="animate-rise space-y-2 pt-2">
        <p className="eyebrow">Account</p>
        <h1 className="text-5xl sm:text-6xl">Your settings.</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={demo ? "demo" : "live"}>{demo ? "Demo session: simulated data" : "Live account"}</Badge>
          {state.profile.displayName ? <span className="text-sm text-taupe-strong">{state.profile.displayName}</span> : null}
        </div>
      </header>

      {demo ? <Callout tone="demo" title="This is a demo">Your data is private to this browser session and expires automatically. No calendar, delivery, email or payment is live.</Callout> : null}
      {msg ? <Callout tone={msg.tone}>{msg.text}</Callout> : null}

      <section aria-labelledby="cal-h" className="space-y-4">
        <h2 id="cal-h" className="text-3xl">Calendar</h2>
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-taupe-strong">Status</dt><dd className="font-medium">
              {cal.status === "not_connected" ? "Not connected" : cal.isDemo ? "Demo calendar (fixtures, not live)" : cal.status === "connected" ? "Connected to Google (read-only)" : cal.status === "needs_reconnect" ? "Needs reconnect" : cal.status === "error" ? "Sync error (will retry)" : cal.status}
            </dd></div>
            <div><dt className="text-taupe-strong">Last sync</dt><dd className="font-medium">{fmt(cal.lastSyncAt)}</dd></div>
            <div><dt className="text-taupe-strong">Scheduled sync</dt><dd className="font-medium">{demo ? "Not applicable in demo" : cal.status === "connected" ? `Every ${cal.syncIntervalMinutes} min · next ${fmt(cal.nextSyncAt)}` : "Off"}</dd></div>
            <div><dt className="text-taupe-strong">Import window</dt><dd className="font-medium">Previous 7 days, next 14 days</dd></div>
          </dl>
          {cal.lastSyncSummary ? <p className="text-xs text-taupe-strong">{cal.lastSyncSummary}</p> : null}
          {cal.lastError ? <Callout tone="warning">{cal.lastError}</Callout> : null}
          {cal.calendars.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Calendars used for planning</p>
              <CalendarPicker calendars={cal.calendars.map((c) => ({ id: c.id, name: c.name, selected: c.selected }))} />
            </div>
          ) : null}
          <CalendarActions connected={cal.status !== "not_connected"} demo={demo} googleReady={caps.googleCalendar} needsReconnect={cal.status === "needs_reconnect"} />
          {!demo && !caps.googleCalendar ? <p className="text-xs text-taupe-strong">Google Calendar isn&rsquo;t configured on this server, so it can&rsquo;t be connected here yet.</p> : null}
          {state.titleMappings.length > 0 ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-sm font-medium">Titles you&rsquo;ve told us about</p>
              <ul className="divide-y divide-line text-sm">
                {state.titleMappings.map((m) => (
                  <li key={m.title} className="flex items-center justify-between gap-3 py-2"><span className="break-words">&ldquo;{m.title}&rdquo; → {m.category === "workout" ? `workout (${m.workoutType ?? "workout"})` : "not a workout"}</span><ForgetMapping title={m.title} /></li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="pref-h" className="space-y-4">
        <h2 id="pref-h" className="text-3xl">Preferences</h2>
        <AccountPrefs initial={prefsValues(state)} demo={demo} />
        <CaffeineGuidance demo={demo} />
        <p className="text-xs text-taupe-strong">Setting provenance: {Object.entries(state.prefs.provenance).map(([k, v]) => `${k}: ${v.replace("_", " ")}`).join(" · ") || "defaults"}.</p>
      </section>

      <section aria-labelledby="live-h" className="space-y-3">
        <h2 id="live-h" className="text-3xl">What&rsquo;s live vs simulated</h2>
        <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface text-sm">
          {[
            ["Sign-in", caps.auth && !demo ? "Live (Supabase Auth)" : demo ? "Not used in demo" : "Not configured"],
            ["Google Calendar", demo ? "Simulated fixtures" : caps.googleCalendar ? "Live, read-only" : "Not configured"],
            ["AI features", ai.label],
            ["Email reminders", demo ? "Preview only, never sent" : caps.email ? `Live (${caps.emailProvider})` : "Preview only until a provider is configured"],
            ["Background reminders & sync", demo ? "Simulated here (the scheduled job runs only on a hosted deployment)" : caps.jobs ? "Scheduled job configured" : "Not configured"],
            ["Orders, payment, shipments", "Always simulated"],
            ["Caffeine per can", demo ? "Illustrative demo values" : caps.verifiedCaffeine ? "Operator-verified" : "Not established; suggestions blocked"],
          ].map(([k, v]) => <li key={k} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-3"><span className="text-taupe-strong">{k}</span><span>{v}</span></li>)}
        </ul>
      </section>

      <section aria-labelledby="priv-h" className="space-y-3">
        <h2 id="priv-h" className="text-3xl">Privacy & data</h2>
        <p className="max-w-prose text-sm text-taupe-strong">Read how long data is kept in <Link href="/privacy" className="underline">Privacy & data retention</Link>.</p>
        <PrivacyActions demo={demo} />
      </section>
    </div>
  );
}
