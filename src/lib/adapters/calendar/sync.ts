import { syncDefaults } from "@/config/policy";
import type { AppState, CalEvent, CalendarInfo } from "@/lib/domain/types";
import { AuthorizationError, SyncTokenExpiredError, TransientError, type CalendarProvider, type RawGoogleEvent } from "./types";

/**
 * Calendar sync (idempotent, provider-agnostic). Imports only: title,
 * start/end, timezone, availability/status, provider ids, recurrence ids.
 * Never descriptions or attendees. Never logs titles.
 */

export interface SyncOptions {
  pastDays?: number;
  futureDays?: number;
  pageSize?: number;
  forceFull?: boolean;
  provider?: "google" | "demo";
}

export interface SyncResult {
  ok: boolean;
  error?: "needs_reconnect" | "transient";
  added: number;
  updated: number;
  removed: number;
  pruned: number;
  calendars: number;
  fullResync: boolean;
}

const DAY = 86_400_000;

export function toCalEvent(raw: RawGoogleEvent, calendarId: string, provider: "google" | "demo"): CalEvent | null {
  if (!raw.start || !raw.end) return null;
  const allDay = Boolean(raw.start.date && !raw.start.dateTime);
  const startIso = raw.start.dateTime ?? (raw.start.date ? `${raw.start.date}T00:00:00.000Z` : null);
  const endIso = raw.end.dateTime ?? (raw.end.date ? `${raw.end.date}T00:00:00.000Z` : null);
  if (!startIso || !endIso) return null;
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const orig = raw.originalStartTime?.dateTime ?? (raw.originalStartTime?.date ? `${raw.originalStartTime.date}T00:00:00.000Z` : undefined);
  const origMs = orig ? Date.parse(orig) : NaN;
  return {
    key: `${provider}:${calendarId}:${raw.id}`,
    provider,
    calendarId,
    eventId: raw.id,
    title: (raw.summary ?? "(no title)").slice(0, 200),
    startUtc: new Date(s).toISOString(),
    endUtc: new Date(e).toISOString(),
    allDay,
    timezone: raw.start.timeZone ?? null,
    status: raw.status === "tentative" ? "tentative" : "confirmed",
    transparency: raw.transparency === "transparent" ? "transparent" : "opaque",
    selfResponse: raw.selfResponse ?? null,
    ...(raw.recurringEventId ? { recurringEventId: raw.recurringEventId } : {}),
    ...(Number.isFinite(origMs) ? { originalStartUtc: new Date(origMs).toISOString() } : {}),
  };
}

async function fetchAll(provider: CalendarProvider, calendarId: string, params: { timeMin?: string; timeMax?: string; syncToken?: string; pageSize: number }) {
  const items: RawGoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const page = await provider.listEvents(calendarId, { ...params, ...(pageToken ? { pageToken } : {}) });
    items.push(...page.items);
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

export async function syncCalendars(state: AppState, provider: CalendarProvider, now: Date, opts: SyncOptions = {}): Promise<SyncResult> {
  const pastDays = opts.pastDays ?? syncDefaults.pastDays;
  const futureDays = opts.futureDays ?? syncDefaults.futureDays;
  const pageSize = opts.pageSize ?? syncDefaults.pageSize;
  const src = opts.provider ?? "google";
  const windowStart = now.getTime() - pastDays * DAY;
  const windowEnd = now.getTime() + futureDays * DAY;
  const timeMin = new Date(windowStart).toISOString();
  const timeMax = new Date(windowEnd).toISOString();
  const result: SyncResult = { ok: true, added: 0, updated: 0, removed: 0, pruned: 0, calendars: 0, fullResync: false };

  const byKey = new Map(state.events.map((e) => [e.key, e]));
  const fail = (error: "needs_reconnect" | "transient", message: string): SyncResult => {
    state.calendar.status = error === "needs_reconnect" ? "needs_reconnect" : "error";
    state.calendar.lastError = message;
    // Data is intentionally retained; nextSyncAt lets the scheduler retry transient failures.
    if (error === "transient") state.calendar.nextSyncAt = new Date(now.getTime() + state.calendar.syncIntervalMinutes * 60_000).toISOString();
    return { ...result, ok: false, error };
  };

  try {
    const listed = await provider.listCalendars();
    const prior = new Map(state.calendar.calendars.map((c) => [c.id, c]));
    const merged: CalendarInfo[] = listed.map((c) => {
      const old = prior.get(c.id);
      return old ? { ...old, name: c.name } : { id: c.id, name: c.name, selected: Boolean(c.primary), syncToken: null };
    });
    const listedIds = new Set(merged.map((c) => c.id));
    const selected = new Set(merged.filter((c) => c.selected).map((c) => c.id));
    // Drop events of calendars that are gone or deselected.
    for (const [k, e] of byKey) {
      if (!listedIds.has(e.calendarId) || !selected.has(e.calendarId)) {
        byKey.delete(k);
        result.removed++;
      }
    }
    result.calendars = selected.size;

    for (const cal of merged) {
      if (!cal.selected) continue;
      let token = opts.forceFull ? undefined : (cal.syncToken ?? undefined);
      let fetched: Awaited<ReturnType<typeof fetchAll>>;
      try {
        fetched = await fetchAll(provider, cal.id, token ? { syncToken: token, pageSize } : { timeMin, timeMax, pageSize });
      } catch (e) {
        if (!(e instanceof SyncTokenExpiredError)) throw e;
        token = undefined;
        cal.syncToken = null;
        fetched = await fetchAll(provider, cal.id, { timeMin, timeMax, pageSize });
      }
      const full = !token;
      if (full) {
        result.fullResync = true;
        // Replace this calendar's rows atomically (fetch completed) so stale rows cannot linger.
        for (const [k, e] of byKey) {
          if (e.calendarId === cal.id) {
            byKey.delete(k);
            result.removed++;
          }
        }
      }
      for (const raw of fetched.items) {
        const key = `${src}:${cal.id}:${raw.id}`;
        if (raw.status === "cancelled") {
          if (byKey.delete(key)) result.removed++;
          continue;
        }
        const ev = toCalEvent(raw, cal.id, src);
        if (!ev) continue;
        const existing = byKey.get(key);
        if (!existing) result.added++;
        else if (JSON.stringify(existing) !== JSON.stringify(ev)) result.updated++;
        byKey.set(key, ev);
      }
      cal.syncToken = fetched.nextSyncToken ?? cal.syncToken ?? null;
    }

    // Retention window enforced locally (a syncToken keeps its original server-side window).
    for (const [k, e] of byKey) {
      if (Date.parse(e.endUtc) < windowStart || Date.parse(e.startUtc) > windowEnd) {
        byKey.delete(k);
        result.pruned++;
      }
    }

    state.events = [...byKey.values()];
    state.calendar.calendars = merged;
    state.calendar.status = "connected";
    state.calendar.lastError = null;
    state.calendar.lastSyncAt = now.toISOString();
    state.calendar.nextSyncAt = new Date(now.getTime() + state.calendar.syncIntervalMinutes * 60_000).toISOString();
    state.calendar.lastSyncSummary = `${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.pruned} outside the window across ${result.calendars} calendar${result.calendars === 1 ? "" : "s"}.`;
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return fail("needs_reconnect", "Google Calendar access needs to be reconnected.");
    if (e instanceof TransientError) return fail("transient", "Google Calendar is temporarily unavailable. We’ll retry.");
    return fail("transient", "Calendar sync failed. We’ll retry.");
  }
}
