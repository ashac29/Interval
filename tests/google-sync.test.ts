import { describe, expect, it } from "vitest";
import { GoogleCalendarProvider } from "@/lib/adapters/calendar/google";
import { syncCalendars } from "@/lib/adapters/calendar/sync";
import { AuthorizationError, SyncTokenExpiredError, TransientError, type CalendarProvider, type ListEventsParams, type RawGoogleEvent } from "@/lib/adapters/calendar/types";
import { createInitialState } from "@/lib/domain/state";

const NOW = new Date("2026-11-17T18:00:00Z");
const iso = (dayOffset: number, hour: number) => new Date(NOW.getTime() + dayOffset * 86_400_000 + (hour - 18) * 3_600_000).toISOString();
const raw = (id: string, dayOffset: number, hour = 18, extra: Partial<RawGoogleEvent> = {}): RawGoogleEvent => ({
  id,
  status: "confirmed",
  summary: `Event ${id}`,
  start: { dateTime: iso(dayOffset, hour), timeZone: "America/Chicago" },
  end: { dateTime: iso(dayOffset, hour + 1), timeZone: "America/Chicago" },
  ...extra,
});

class Fake implements CalendarProvider {
  calls: { cal: string; p: ListEventsParams }[] = [];
  calendars = [{ id: "primary", name: "Me", primary: true }];
  pages: Record<string, { items: RawGoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }[]> = {};
  handler?: (cal: string, p: ListEventsParams) => void;
  async listCalendars() {
    return this.calendars;
  }
  async listEvents(cal: string, p: ListEventsParams) {
    this.calls.push({ cal, p });
    this.handler?.(cal, p);
    const pages = this.pages[cal] ?? [{ items: [] }];
    const i = p.pageToken ? Number(p.pageToken) : 0;
    const page = pages[i]!;
    return { ...page, nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined };
  }
}
const fresh = () => createInitialState({ mode: "live", timezone: "America/Chicago", now: NOW });

describe("calendar sync", () => {
  it("imports across pages, is idempotent, and selects only the primary calendar by default", async () => {
    const st = fresh();
    const f = new Fake();
    f.calendars.push({ id: "other", name: "Other" } as never);
    f.pages.primary = [{ items: [raw("a", 1), raw("b", 2)] }, { items: [raw("c", 3)], nextSyncToken: "tok1" }];
    f.pages.other = [{ items: [raw("z", 1)] }];
    const r1 = await syncCalendars(st, f, NOW);
    expect(r1).toMatchObject({ ok: true, added: 3, fullResync: true });
    expect(st.events.map((e) => e.key).sort()).toEqual(["google:primary:a", "google:primary:b", "google:primary:c"]);
    expect(st.calendar.calendars.find((c) => c.id === "primary")).toMatchObject({ selected: true, syncToken: "tok1" });
    expect(st.calendar.calendars.find((c) => c.id === "other")!.selected).toBe(false);
    expect(f.calls.every((c) => c.cal === "primary")).toBe(true);
    // Re-run in full mode: same rows, no duplicates.
    const r2 = await syncCalendars(st, f, NOW, { forceFull: true });
    expect(st.events).toHaveLength(3);
    expect(r2.updated).toBe(0);
    expect(st.calendar.status).toBe("connected");
    expect(st.calendar.lastSyncSummary).not.toMatch(/Event/);
  });

  it("incremental sync sends the syncToken and none of the forbidden params", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("a", 1)], nextSyncToken: "t1" }];
    await syncCalendars(st, f, NOW);
    f.calls.length = 0;
    f.pages.primary = [{ items: [], nextSyncToken: "t2" }];
    const r = await syncCalendars(st, f, NOW);
    expect(r.fullResync).toBe(false);
    expect(f.calls[0]!.p).toEqual({ syncToken: "t1", pageSize: 250 });
    expect(st.calendar.calendars[0]!.syncToken).toBe("t2");
    expect(st.events).toHaveLength(1);
  });

  it("applies rescheduling in place and removes cancellations", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("a", 1, 7), raw("b", 2)], nextSyncToken: "t1" }];
    await syncCalendars(st, f, NOW);
    f.pages.primary = [{ items: [raw("a", 1, 9), { id: "b", status: "cancelled" }], nextSyncToken: "t2" }];
    const r = await syncCalendars(st, f, NOW);
    expect(r).toMatchObject({ updated: 1, removed: 1, added: 0 });
    expect(st.events).toHaveLength(1);
    expect(st.events[0]!.startUtc).toBe(iso(1, 9));
  });

  it("keeps recurring instances distinct and records the original start", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("s_1", 1, 7, { recurringEventId: "s", originalStartTime: { dateTime: iso(1, 7) } }), raw("s_2", 2, 8, { recurringEventId: "s", originalStartTime: { dateTime: iso(2, 7) } })], nextSyncToken: "t" }];
    await syncCalendars(st, f, NOW);
    expect(st.events).toHaveLength(2);
    const moved = st.events.find((e) => e.eventId === "s_2")!;
    expect(moved.recurringEventId).toBe("s");
    expect(moved.originalStartUtc).toBe(iso(2, 7));
    expect(moved.startUtc).toBe(iso(2, 8));
  });

  it("expired sync token (410) triggers a full resync that clears stale rows", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("old", 1), raw("keep", 2)], nextSyncToken: "t1" }];
    await syncCalendars(st, f, NOW);
    let first = true;
    f.handler = (_c, p) => {
      if (p.syncToken && first) {
        first = false;
        throw new SyncTokenExpiredError();
      }
    };
    f.pages.primary = [{ items: [raw("keep", 2), raw("new", 3)], nextSyncToken: "t9" }];
    const r = await syncCalendars(st, f, NOW);
    expect(r.fullResync).toBe(true);
    expect(st.events.map((e) => e.eventId).sort()).toEqual(["keep", "new"]);
    expect(f.calls.at(-1)!.p.syncToken).toBeUndefined();
    expect(f.calls.at(-1)!.p.timeMin).toBeDefined();
    expect(st.calendar.calendars[0]!.syncToken).toBe("t9");
  });

  it("authorization failure sets needs_reconnect and retains data", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("a", 1)], nextSyncToken: "t1" }];
    await syncCalendars(st, f, NOW);
    f.handler = () => {
      throw new AuthorizationError("invalid_grant secret-token");
    };
    const r = await syncCalendars(st, f, NOW);
    expect(r).toMatchObject({ ok: false, error: "needs_reconnect" });
    expect(st.calendar.status).toBe("needs_reconnect");
    expect(st.calendar.lastError).not.toMatch(/secret/);
    expect(st.events).toHaveLength(1);
  });

  it("transient failure sets error status, keeps data, schedules a retry", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("a", 1)], nextSyncToken: "t1" }];
    await syncCalendars(st, f, NOW);
    f.handler = () => {
      throw new TransientError();
    };
    const r = await syncCalendars(st, f, NOW);
    expect(r).toMatchObject({ ok: false, error: "transient" });
    expect(st.calendar.status).toBe("error");
    expect(st.events).toHaveLength(1);
    expect(st.calendar.nextSyncAt).toBeTruthy();
  });

  it("prunes events outside the retention window", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [{ items: [raw("past", -30), raw("future", 40), raw("in", 3)], nextSyncToken: "t" }];
    const r = await syncCalendars(st, f, NOW);
    expect(r.pruned).toBe(2);
    expect(st.events.map((e) => e.eventId)).toEqual(["in"]);
  });

  it("maps all-day, transparency and declined responses; drops events without times", async () => {
    const st = fresh();
    const f = new Fake();
    f.pages.primary = [
      {
        items: [
          { id: "ad", status: "confirmed", summary: "Holiday", start: { date: "2026-11-18" }, end: { date: "2026-11-19" }, transparency: "transparent" },
          raw("dec", 1, 9, { selfResponse: "declined" }),
          { id: "bad", status: "confirmed", summary: "No times" },
        ],
        nextSyncToken: "t",
      },
    ];
    await syncCalendars(st, f, NOW);
    const ad = st.events.find((e) => e.eventId === "ad")!;
    expect(ad).toMatchObject({ allDay: true, transparency: "transparent", timezone: null });
    expect(st.events.find((e) => e.eventId === "dec")!.selfResponse).toBe("declined");
    expect(st.events.find((e) => e.eventId === "bad")).toBeUndefined();
  });

  it("never stores descriptions or attendees even if present in the payload", async () => {
    const st = fresh();
    const f = new Fake();
    const dirty = { ...raw("a", 1), description: "private notes", attendees: [{ email: "x@y.z" }], location: "Secret HQ" } as unknown as RawGoogleEvent;
    f.pages.primary = [{ items: [dirty], nextSyncToken: "t" }];
    await syncCalendars(st, f, NOW);
    const json = JSON.stringify(st.events);
    expect(json).not.toMatch(/private notes|x@y\.z|Secret HQ|description|attendees|location/);
  });

  it("preserves a user's calendar selection across syncs", async () => {
    const st = fresh();
    const f = new Fake();
    f.calendars.push({ id: "work", name: "Work" } as never);
    f.pages.work = [{ items: [raw("w", 1)], nextSyncToken: "w1" }];
    f.pages.primary = [{ items: [raw("p", 1)], nextSyncToken: "p1" }];
    await syncCalendars(st, f, NOW);
    st.calendar.calendars.find((c) => c.id === "work")!.selected = true;
    st.calendar.calendars.find((c) => c.id === "primary")!.selected = false;
    await syncCalendars(st, f, NOW);
    expect(st.events.map((e) => e.calendarId)).toEqual(["work"]);
  });
});

describe("GoogleCalendarProvider requests", () => {
  const mkFetch = (status: number, body: unknown) => {
    const urls: string[] = [];
    const fn = (async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { fn, urls };
  };

  it("full sync sends window + singleEvents + showDeleted + minimal fields", async () => {
    const { fn, urls } = mkFetch(200, { items: [{ id: "a", summary: "x", description: "d", attendees: [{ self: true, responseStatus: "declined" }, { responseStatus: "accepted" }] }], nextSyncToken: "n" });
    const res = await new GoogleCalendarProvider("tok", fn).listEvents("cal@x", { timeMin: "2026-01-01T00:00:00Z", timeMax: "2026-02-01T00:00:00Z", pageSize: 50 });
    const u = new URL(urls[0]!);
    expect(u.pathname).toBe("/calendar/v3/calendars/cal%40x/events");
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("showDeleted")).toBe("true");
    expect(u.searchParams.get("maxResults")).toBe("50");
    expect(u.searchParams.get("timeMin")).toBeTruthy();
    expect(u.searchParams.get("fields")).not.toMatch(/description|location|organizer/);
    expect(JSON.stringify(res.items)).not.toMatch(/description|attendees/);
    expect(res.items[0]!.selfResponse).toBe("declined");
    expect(res.nextSyncToken).toBe("n");
  });

  it("syncToken requests omit timeMin/timeMax/orderBy/q/updatedMin", async () => {
    const { fn, urls } = mkFetch(200, { items: [] });
    await new GoogleCalendarProvider("tok", fn).listEvents("primary", { syncToken: "abc", timeMin: "x", timeMax: "y" });
    const u = new URL(urls[0]!);
    expect(u.searchParams.get("syncToken")).toBe("abc");
    for (const k of ["timeMin", "timeMax", "orderBy", "q", "updatedMin"]) expect(u.searchParams.has(k)).toBe(false);
  });

  it("maps HTTP statuses to typed errors", async () => {
    const run = (status: number, body: unknown = {}) => new GoogleCalendarProvider("t", mkFetch(status, body).fn).listEvents("p", {});
    await expect(run(410)).rejects.toBeInstanceOf(SyncTokenExpiredError);
    await expect(run(401)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(run(403, { error: { errors: [{ reason: "insufficientPermissions" }] } })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(run(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } })).rejects.toBeInstanceOf(TransientError);
    await expect(run(503)).rejects.toBeInstanceOf(TransientError);
    await expect(run(429)).rejects.toBeInstanceOf(TransientError);
  });

  it("paginates the calendar list", async () => {
    const pages = [{ items: [{ id: "a", summary: "A", primary: true }], nextPageToken: "2" }, { items: [{ id: "b", summaryOverride: "B!" }] }];
    let i = 0;
    const fn = (async () => new Response(JSON.stringify(pages[i++]), { status: 200 })) as unknown as typeof fetch;
    expect(await new GoogleCalendarProvider("t", fn).listCalendars()).toEqual([{ id: "a", name: "A", primary: true }, { id: "b", name: "B!" }]);
  });
});
