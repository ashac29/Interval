import { AuthorizationError, SyncTokenExpiredError, TransientError, type CalendarProvider, type ListEventsParams, type ListEventsResult, type RawGoogleEvent } from "./types";

/**
 * Google Calendar REST client (read-only).
 *
 * Data minimization: the `fields` mask excludes description, location,
 * attendee lists, organizer, links, etc. `attendees(self,responseStatus)` is
 * requested ONLY so we can read the user's own response; it is reduced to
 * `selfResponse` immediately and nothing else about attendees is kept.
 *
 * Incremental sync restrictions: with a syncToken, Google rejects timeMin,
 * timeMax, orderBy, q, updatedMin etc., so we send none of them. A full sync
 * sends timeMin/timeMax + singleEvents=true and returns nextSyncToken on the
 * LAST page. A syncToken from a time-bounded sync keeps that original window,
 * so the retention window is enforced LOCALLY by pruning in sync.ts.
 */

const BASE = "https://www.googleapis.com/calendar/v3";
const EVENT_FIELDS = "nextPageToken,nextSyncToken,items(id,status,summary,start,end,transparency,recurringEventId,originalStartTime,updated,eventType,attendees(self,responseStatus))";

type Json = Record<string, unknown>;

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private accessToken: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(url: URL): Promise<Json> {
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${this.accessToken}` } });
    } catch {
      throw new TransientError("Could not reach Google Calendar");
    }
    if (res.ok) return (await res.json()) as Json;
    if (res.status === 410) throw new SyncTokenExpiredError();
    if (res.status === 401) throw new AuthorizationError("Google Calendar rejected the credentials");
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; status?: string } };
      const reason = body.error?.errors?.[0]?.reason ?? "";
      if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(reason)) throw new TransientError("Google Calendar rate limit");
      throw new AuthorizationError("Google Calendar access was denied");
    }
    if (res.status === 429 || res.status >= 500) throw new TransientError(`Google Calendar error ${res.status}`);
    throw new TransientError(`Unexpected Google Calendar response ${res.status}`);
  }

  async listCalendars() {
    const out: { id: string; name: string; primary?: boolean }[] = [];
    let pageToken: string | undefined;
    do {
      const u = new URL(`${BASE}/users/me/calendarList`);
      u.searchParams.set("fields", "nextPageToken,items(id,summary,summaryOverride,primary)");
      u.searchParams.set("minAccessRole", "reader");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const body = await this.get(u);
      for (const c of (body.items as { id: string; summary?: string; summaryOverride?: string; primary?: boolean }[] | undefined) ?? []) {
        out.push({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, ...(c.primary ? { primary: true } : {}) });
      }
      pageToken = body.nextPageToken as string | undefined;
    } while (pageToken);
    return out;
  }

  async listEvents(calendarId: string, p: ListEventsParams): Promise<ListEventsResult> {
    const u = new URL(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
    u.searchParams.set("singleEvents", "true");
    u.searchParams.set("showDeleted", "true");
    u.searchParams.set("maxResults", String(p.pageSize ?? 250));
    u.searchParams.set("fields", EVENT_FIELDS);
    if (p.syncToken) {
      u.searchParams.set("syncToken", p.syncToken); // no timeMin/timeMax/orderBy/q/updatedMin allowed alongside
    } else {
      if (p.timeMin) u.searchParams.set("timeMin", p.timeMin);
      if (p.timeMax) u.searchParams.set("timeMax", p.timeMax);
    }
    if (p.pageToken) u.searchParams.set("pageToken", p.pageToken);
    const body = await this.get(u);
    const items: RawGoogleEvent[] = ((body.items as (RawGoogleEvent & { attendees?: { self?: boolean; responseStatus?: RawGoogleEvent["selfResponse"] }[] })[] | undefined) ?? []).map((raw) => {
      const self = raw.attendees?.find((a) => a.self);
      return {
        id: raw.id,
        status: raw.status,
        summary: raw.summary,
        start: raw.start,
        end: raw.end,
        transparency: raw.transparency,
        recurringEventId: raw.recurringEventId,
        originalStartTime: raw.originalStartTime,
        updated: raw.updated,
        eventType: raw.eventType,
        selfResponse: self?.responseStatus ?? null,
      };
    });
    return { items, nextPageToken: body.nextPageToken as string | undefined, nextSyncToken: body.nextSyncToken as string | undefined };
  }
}
