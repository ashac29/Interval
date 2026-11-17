import type { Iso, LocalDate } from "./types";

/**
 * Time helpers. Instants are UTC milliseconds / ISO strings. Wall-clock
 * reasoning always happens in an explicit IANA timezone (the planning
 * timezone), never the device or server timezone.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsAt(ms: number, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { y: out.year ?? 0, mo: out.month ?? 0, d: out.day ?? 0, h: (out.hour ?? 0) % 24, mi: out.minute ?? 0, s: out.second ?? 0 };
}

/** Offset (local - UTC) in ms for a zone at an instant. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = partsAt(ms, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export function parseHHmm(v: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) throw new Error(`Invalid HH:mm "${v}"`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) throw new Error(`Invalid HH:mm "${v}"`);
  return h * 60 + mi;
}

export function isHHmm(v: unknown): v is string {
  return typeof v === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function minutesToHHmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Local wall time -> UTC ms. DST gap times shift forward; ambiguous times take the first occurrence. */
export function zonedToUtcMs(date: LocalDate, minutesOfDay: number, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, mo - 1, d, 0, 0, 0) + minutesOfDay * 60_000;
  let guess = naive - tzOffsetMs(naive, tz);
  // Re-evaluate once or twice to settle across transitions.
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMs(guess, tz);
    const next = naive - off;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

export function localDateOf(ms: number, tz: string): LocalDate {
  const p = partsAt(ms, tz);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
}

export function localMinutesOf(ms: number, tz: string): number {
  const p = partsAt(ms, tz);
  return p.h * 60 + p.mi;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export function weekdayOf(date: LocalDate): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** Monday of the week containing `date`. */
export function weekStartOf(date: LocalDate): LocalDate {
  const wd = weekdayOf(date);
  return addDays(date, -((wd + 6) % 7));
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  const pa = a.split("-").map(Number) as [number, number, number];
  const pb = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86_400_000);
}

/** Real local-day bounds: 23 or 25 hours on DST days. */
export function dayBounds(date: LocalDate, tz: string): { startMs: number; endMs: number } {
  return { startMs: zonedToUtcMs(date, 0, tz), endMs: zonedToUtcMs(addDays(date, 1), 0, tz) };
}

export function isoOf(ms: number): Iso {
  return new Date(ms).toISOString();
}

export function inQuietHours(ms: number, tz: string, quiet: { start: string; end: string }): boolean {
  const m = localMinutesOf(ms, tz);
  const s = parseHHmm(quiet.start);
  const e = parseHHmm(quiet.end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** First instant at/after `ms` that is outside quiet hours. */
export function nextQuietEnd(ms: number, tz: string, quiet: { start: string; end: string }): number {
  if (!inQuietHours(ms, tz, quiet)) return ms;
  const date = localDateOf(ms, tz);
  const endMin = parseHHmm(quiet.end);
  let candidate = zonedToUtcMs(date, endMin, tz);
  if (candidate <= ms) candidate = zonedToUtcMs(addDays(date, 1), endMin, tz);
  return candidate;
}

export function formatTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

export function formatDayLong(date: LocalDate): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(
    new Date(Date.UTC(y, mo - 1, d, 12)),
  );
}

export function formatDayShort(date: LocalDate): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(Date.UTC(y, mo - 1, d, 12)),
  );
}

export function weekdayName(wd: number, long = true): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wd]!.slice(0, long ? undefined : 3);
}

export function formatClock(hhmm: string): string {
  const m = parseHHmm(hhmm);
  const h = Math.floor(m / 60) % 24;
  const mi = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mi === 0 ? `${h12} ${ap}` : `${h12}:${pad2(mi)} ${ap}`;
}

export const TIMEZONE_CHOICES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
