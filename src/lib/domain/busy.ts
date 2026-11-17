import type { AppState, CalEvent, Interval, LocalDate } from "./types";
import { dayBounds } from "./time";

/** Events that occupy the user's time by default: not cancelled, declined, all-day or free/transparent. */
export function countsAsBusy(e: CalEvent): boolean {
  if (e.status === "cancelled") return false;
  if (e.selfResponse === "declined") return false;
  if (e.allDay) return false;
  if (e.transparency === "transparent") return false;
  return true;
}

/** Merge overlapping/touching intervals so overlapping calendars are never double-counted. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.endMs > i.startMs)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.startMs <= last.endMs) last.endMs = Math.max(last.endMs, iv.endMs);
    else out.push(iv);
  }
  return out;
}

export function clip(iv: Interval, startMs: number, endMs: number): Interval | null {
  const s = Math.max(iv.startMs, startMs);
  const e = Math.min(iv.endMs, endMs);
  return e > s ? { startMs: s, endMs: e } : null;
}

/** Events from calendars the user has selected. */
export function activeEvents(state: Pick<AppState, "events" | "calendar">): CalEvent[] {
  const selected = new Set(state.calendar.calendars.filter((c) => c.selected).map((c) => c.id));
  if (state.calendar.calendars.length === 0) return state.events;
  return state.events.filter((e) => selected.has(e.calendarId));
}

export function busyIntervalsForDay(events: CalEvent[], date: LocalDate, tz: string): Interval[] {
  const { startMs, endMs } = dayBounds(date, tz);
  const clipped: Interval[] = [];
  for (const e of events) {
    if (!countsAsBusy(e)) continue;
    const c = clip({ startMs: Date.parse(e.startUtc), endMs: Date.parse(e.endUtc) }, startMs, endMs);
    if (c) clipped.push(c);
  }
  return mergeIntervals(clipped);
}

export function occupiedHours(busy: Interval[]): number {
  return busy.reduce((s, i) => s + (i.endMs - i.startMs), 0) / 3_600_000;
}

/** Free gaps within [fromMs, toMs] given merged busy intervals. */
export function freeGaps(busy: Interval[], fromMs: number, toMs: number): Interval[] {
  const gaps: Interval[] = [];
  let cursor = fromMs;
  for (const b of busy) {
    if (b.endMs <= cursor) continue;
    if (b.startMs >= toMs) break;
    if (b.startMs > cursor) gaps.push({ startMs: cursor, endMs: Math.min(b.startMs, toMs) });
    cursor = Math.max(cursor, b.endMs);
  }
  if (cursor < toMs) gaps.push({ startMs: cursor, endMs: toMs });
  return gaps;
}

export function overlaps(a: Interval, busy: Interval[]): boolean {
  return busy.some((b) => a.startMs < b.endMs && a.endMs > b.startMs);
}
