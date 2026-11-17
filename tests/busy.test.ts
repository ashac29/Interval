import { describe, expect, it } from "vitest";
import { busyIntervalsForDay, mergeIntervals, occupiedHours, countsAsBusy } from "@/lib/domain/busy";
import { DATE, TZ, ev } from "./helpers";

describe("busy time", () => {
  it("merges overlapping and touching intervals", () => {
    expect(mergeIntervals([{ startMs: 0, endMs: 10 }, { startMs: 5, endMs: 20 }, { startMs: 20, endMs: 30 }, { startMs: 40, endMs: 50 }])).toEqual([
      { startMs: 0, endMs: 30 },
      { startMs: 40, endMs: 50 },
    ]);
  });
  it("does not double-count overlapping calendars", () => {
    const events = [ev(DATE, "09:00", "12:00", "A", { calendarId: "work" }), ev(DATE, "10:00", "13:00", "B", { calendarId: "primary" }), ev(DATE, "11:00", "11:30", "C")];
    expect(occupiedHours(busyIntervalsForDay(events, DATE, TZ))).toBe(4);
  });
  it("excludes cancelled, declined, all-day and transparent events", () => {
    const events = [
      ev(DATE, "09:00", "10:00", "cancelled", { status: "cancelled" }),
      ev(DATE, "10:00", "11:00", "declined", { selfResponse: "declined" }),
      ev(DATE, "00:00", "23:00", "all day", { allDay: true }),
      ev(DATE, "12:00", "13:00", "free", { transparency: "transparent" }),
      ev(DATE, "14:00", "15:00", "real"),
    ];
    expect(events.filter(countsAsBusy)).toHaveLength(1);
    expect(occupiedHours(busyIntervalsForDay(events, DATE, TZ))).toBe(1);
  });
  it("clips events that cross local midnight to the planning day", () => {
    const e = ev(DATE, "22:00", "23:59", "late");
    e.endUtc = new Date(Date.parse(e.endUtc) + 3 * 3_600_000).toISOString();
    expect(occupiedHours(busyIntervalsForDay([e], DATE, TZ))).toBeLessThan(2.1);
  });
});
