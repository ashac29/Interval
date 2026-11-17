import { createInitialState } from "@/lib/domain/state";
import { recompute } from "@/lib/domain/engine";
import { isoOf, parseHHmm, zonedToUtcMs } from "@/lib/domain/time";
import { newId } from "@/lib/domain/ids";
import type { AppState, CalEvent, Recommendation } from "@/lib/domain/types";
import type { Flavor } from "@/config/products";

export const TZ = "America/Chicago";
export const DATE = "2026-11-17"; // a Tuesday, CST (UTC-6)

export const at = (date: string, hhmm: string, tz = TZ) => new Date(zonedToUtcMs(date, parseHHmm(hhmm), tz));

let n = 0;
export function ev(date: string, from: string, to: string, title: string, o: Partial<CalEvent> = {}): CalEvent {
  const id = `t${++n}`;
  const cal = o.calendarId ?? "primary";
  return {
    key: `demo:${cal}:${id}`,
    provider: "demo",
    calendarId: cal,
    eventId: id,
    title,
    startUtc: isoOf(zonedToUtcMs(date, parseHHmm(from), TZ)),
    endUtc: isoOf(zonedToUtcMs(date, parseHHmm(to), TZ)),
    allDay: false,
    timezone: TZ,
    status: "confirmed",
    transparency: "opaque",
    selfResponse: "accepted",
    ...o,
  };
}

export function mkState(opts: { now?: Date; events?: CalEvent[]; stock?: Partial<Record<Flavor, number>>; mode?: "demo" | "live"; prefs?: Partial<AppState["prefs"]> } = {}): { state: AppState; now: Date } {
  const now = opts.now ?? at(DATE, "07:00");
  const state = createInitialState({ mode: opts.mode ?? "demo", timezone: TZ, now });
  state.profile.onboarded = true;
  state.calendar.status = "connected";
  state.calendar.provider = "demo";
  state.calendar.isDemo = true;
  state.calendar.calendars = [{ id: "primary", name: "Personal", selected: true }, { id: "work", name: "Work", selected: true }];
  const stock = { chai: 6, oolong: 6, matcha: 6, ...opts.stock };
  for (const f of Object.keys(stock) as Flavor[]) state.inventory.push({ id: newId("inv"), flavor: f, delta: stock[f]!, reason: "correction", basis: "logged", at: now.toISOString() });
  Object.assign(state.prefs, opts.prefs ?? {});
  state.events = opts.events ?? [];
  return { state, now };
}

export function rec(state: AppState, o: Partial<Recommendation> & { startUtc: string }): Recommendation {
  const r: Recommendation = {
    id: newId("rec"),
    localDate: DATE,
    flavor: "chai",
    kind: "busy_gap",
    status: "proposed",
    eventRefs: [],
    anchorUtc: null,
    reasonCodes: [],
    reason: "test",
    score: { total: 0, parts: [] },
    scoringVersion: "t",
    policyVersion: "t",
    caffeine: { mg: 40, status: "illustrative" },
    source: "engine",
    manual: { timeEdited: false, flavorEdited: false },
    conflict: null,
    createdAt: state.profile.createdAt,
    updatedAt: state.profile.createdAt,
    ...o,
  };
  state.recommendations.push(r);
  return r;
}

export const plan = (state: AppState, now: Date) => recompute(state, now, { trigger: "test" });
export const todayRecs = (state: AppState, date = DATE) => state.recommendations.filter((r) => r.localDate === date);
