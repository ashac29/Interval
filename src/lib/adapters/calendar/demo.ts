import type { AppState } from "@/lib/domain/types";
import type { CalendarProvider, RawGoogleEvent } from "./types";

/** Serves the demo state's own fixture events so "refresh" works with no credentials. Demo only, never live. */
export class DemoCalendarProvider implements CalendarProvider {
  constructor(private state: Pick<AppState, "events" | "calendar">) {}

  async listCalendars() {
    return this.state.calendar.calendars.map((c, i) => ({ id: c.id, name: c.name, ...(i === 0 ? { primary: true } : {}) }));
  }

  async listEvents(calendarId: string) {
    const items: RawGoogleEvent[] = this.state.events
      .filter((e) => e.calendarId === calendarId)
      .map((e) => ({
        id: e.eventId,
        status: e.status,
        summary: e.title,
        start: e.allDay ? { date: e.startUtc.slice(0, 10) } : { dateTime: e.startUtc, ...(e.timezone ? { timeZone: e.timezone } : {}) },
        end: e.allDay ? { date: e.endUtc.slice(0, 10) } : { dateTime: e.endUtc, ...(e.timezone ? { timeZone: e.timezone } : {}) },
        transparency: e.transparency,
        recurringEventId: e.recurringEventId,
        selfResponse: e.selfResponse,
      }));
    return { items, nextSyncToken: "demo" };
  }
}
