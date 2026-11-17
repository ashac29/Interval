import { aiDefaults } from "@/config/policy";
import { getAi } from "@/lib/ai";
import { classifyPending } from "@/lib/domain/classify";
import { recompute } from "@/lib/domain/engine";
import type { AppState } from "@/lib/domain/types";
import { AuthorizationError, DemoCalendarProvider, GoogleCalendarProvider, refreshAccessToken, syncCalendars, type SyncResult } from "@/lib/adapters/calendar";
import { decryptSecret } from "@/lib/crypto";
import { getEnv, googleConfigured } from "@/lib/env";
import { loadCredentials } from "@/lib/supabase/credentials";

void aiDefaults;

export type RefreshOutcome = { ok: true; summary: string } | { ok: false; error: string };

const describe = (r: SyncResult) =>
  `${r.added} added, ${r.updated} updated, ${r.removed} removed${r.fullResync ? " (full resync)" : ""} across ${r.calendars} calendar${r.calendars === 1 ? "" : "s"}`;

/** Re-run classification (ambiguous titles only) and recompute plans after events change. */
export async function afterCalendarChange(state: AppState, now: Date, trigger: string) {
  await classifyPending(state, getAi(state.mode));
  recompute(state, now, { trigger });
}

/** Demo: "refresh" re-reads the fixtures. It is clearly NOT a live connection. */
export async function refreshDemoCalendar(state: AppState, now: Date): Promise<RefreshOutcome> {
  const r = await syncCalendars(state, new DemoCalendarProvider(state), now, { provider: "demo" });
  state.calendar.isDemo = true;
  state.calendar.lastSyncSummary = `Demo fixtures re-read (${describe(r)}). Not a live Google Calendar connection.`;
  await afterCalendarChange(state, now, "calendar_refresh");
  return { ok: true, summary: state.calendar.lastSyncSummary };
}

/** Live: refresh the access token from the encrypted refresh token, sync, classify, recompute. */
export async function refreshLiveCalendar(state: AppState, userId: string, now: Date, opts: { forceFull?: boolean } = {}): Promise<RefreshOutcome> {
  const env = getEnv();
  if (!googleConfigured()) return { ok: false, error: "Google Calendar isn’t configured on this server." };
  const creds = await loadCredentials(userId);
  if (!creds) {
    state.calendar.status = "not_connected";
    return { ok: false, error: "Calendar isn’t connected." };
  }
  let accessToken: string;
  try {
    const refreshToken = decryptSecret(creds.token, env.tokenEncryptionKey as string);
    accessToken = (await refreshAccessToken({ refreshToken, clientId: env.googleClientId as string, clientSecret: env.googleClientSecret as string })).accessToken;
  } catch (e) {
    if (e instanceof AuthorizationError) {
      state.calendar.status = "needs_reconnect";
      state.calendar.lastError = "Google no longer authorizes this connection. Reconnect to continue syncing.";
      return { ok: false, error: state.calendar.lastError };
    }
    state.calendar.status = "error";
    state.calendar.lastError = "Couldn’t reach Google. Your existing data is unchanged; we’ll retry.";
    return { ok: false, error: state.calendar.lastError };
  }
  const r = await syncCalendars(state, new GoogleCalendarProvider(accessToken), now, {
    provider: "google",
    pastDays: env.sync.pastDays,
    futureDays: env.sync.futureDays,
    forceFull: opts.forceFull,
  });
  if (!r.ok) return { ok: false, error: state.calendar.lastError ?? "Sync failed." };
  await afterCalendarChange(state, now, "calendar_sync");
  return { ok: true, summary: describe(r) };
}
