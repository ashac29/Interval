import type { Flavor } from "@/config/products";
import { mockAi } from "@/lib/ai/mock";
import { classifyPending } from "./classify";
import { recompute } from "./engine";
import { newId } from "./ids";
import { createInitialState } from "./state";
import { addDays, isoOf, localDateOf, parseHHmm, zonedToUtcMs } from "./time";
import type { AppState, CalEvent, LocalDate } from "./types";
import { syncDefaults } from "@/config/policy";

/**
 * Demo fixtures. Dates are generated relative to the real "today" in the demo
 * planning timezone (except the DST scenario, which is pinned to the real
 * 2027 US spring-forward weekend) and the clock is frozen at a scenario time,
 * so each scenario is deterministic in shape. Everything here is invented and
 * labeled as demo data in the UI.
 */

export const DEMO_TZ = "America/Chicago";

export interface ScenarioMeta {
  id: string;
  name: string;
  blurb: string;
  nowAt: string; // HH:mm local
}

export const SCENARIOS: ScenarioMeta[] = [
  { id: "busy-morning", name: "Busy morning workout", blurb: "Early workout, then a packed day. Post-workout suggestion fits the only open gap.", nowAt: "07:35" },
  { id: "quiet-workout", name: "Quiet workout day", blurb: "A midday workout and an open calendar.", nowAt: "09:00" },
  { id: "busy-no-workout", name: "Busy day, no workout", blurb: "Four-plus hours of meetings and no workout. Suggests the longest gap.", nowAt: "08:30" },
  { id: "evening-cutoff", name: "Evening workout & caffeine cutoff", blurb: "A 6 PM workout falls after your 3 PM cutoff, so nothing is suggested.", nowAt: "10:00" },
  { id: "ambiguous-title", name: "Ambiguous workout title", blurb: "“Session with Dana” might be a workout. You confirm before it’s used.", nowAt: "09:30" },
  { id: "recurring-rescheduled", name: "Recurring & rescheduled workout", blurb: "A recurring spin class moved by an hour; your accepted drink is re-checked.", nowAt: "06:00" },
  { id: "overlapping-events", name: "Overlapping calendars", blurb: "Work and personal meetings overlap. Busy time is merged, never double-counted.", nowAt: "08:00" },
  { id: "no-slots", name: "No eligible slots", blurb: "Workout followed by back-to-back meetings. Zero suggestions is a valid answer.", nowAt: "06:30" },
  { id: "unknown-caffeine", name: "Unknown caffeine", blurb: "Caffeine per flavor isn’t established, so nothing can pass the caffeine check.", nowAt: "09:00" },
  { id: "two-drinks", name: "Two drinks already logged", blurb: "You’re at your daily limit; suggestions stop but logging stays truthful.", nowAt: "13:05" },
  { id: "low-inventory", name: "Insufficient inventory", blurb: "Only one oolong can left. Replenishment suggestions need your confirmation.", nowAt: "08:00" },
  { id: "dst-boundary", name: "Daylight-saving boundary", blurb: "The planning week crosses the March 2027 spring-forward day (23 hours).", nowAt: "20:00" },
];

export const DEFAULT_SCENARIO = "busy-morning";

type EvOpts = { cal?: string; status?: CalEvent["status"]; transparent?: boolean; declined?: boolean; recurring?: string; origStart?: string; allDay?: boolean; tz?: string };

class Builder {
  events: CalEvent[] = [];
  private n = 0;
  constructor(
    public tz: string,
    public today: LocalDate,
  ) {}
  d(offset: number): LocalDate {
    return addDays(this.today, offset);
  }
  ev(offset: number, from: string, to: string, title: string, o: EvOpts = {}) {
    const date = this.d(offset);
    const cal = o.cal ?? "primary";
    const id = `fx${++this.n}`;
    this.events.push({
      key: `demo:${cal}:${id}`,
      provider: "demo",
      calendarId: cal,
      eventId: id,
      title,
      startUtc: isoOf(zonedToUtcMs(date, parseHHmm(from), this.tz)),
      endUtc: isoOf(zonedToUtcMs(date, parseHHmm(to), this.tz)),
      allDay: o.allDay ?? false,
      timezone: o.tz ?? this.tz,
      status: o.status ?? "confirmed",
      transparency: o.transparent ? "transparent" : "opaque",
      selfResponse: o.declined ? "declined" : "accepted",
      ...(o.recurring ? { recurringEventId: o.recurring } : {}),
      ...(o.origStart ? { originalStartUtc: o.origStart } : {}),
    });
    return this.events[this.events.length - 1]!;
  }
}

function baselineWeek(b: Builder, skipToday = true) {
  // Past days (inside the 7-day import window) and the coming week. Today is scenario-specific.
  b.ev(-2, "07:00", "08:00", "Gym — lower body");
  b.ev(-1, "10:00", "11:00", "Team standup", { cal: "work" });
  b.ev(1, "07:00", "08:00", "Gym — upper body");
  b.ev(1, "10:00", "11:00", "Product sync", { cal: "work" });
  b.ev(1, "14:00", "15:30", "Design review", { cal: "work" });
  b.ev(2, "09:00", "16:30", "Team offsite", { cal: "work" });
  b.ev(3, "11:00", "11:30", "1:1 with Sam", { cal: "work" });
  b.ev(3, "18:00", "19:00", "Yoga");
  b.ev(4, "06:30", "07:15", "Morning run");
  b.ev(4, "10:00", "12:00", "Roadmap planning", { cal: "work" });
  b.ev(4, "12:30", "13:30", "Lunch with Priya");
  b.ev(4, "14:00", "16:00", "Workshop", { cal: "work" });
  b.ev(5, "09:00", "10:00", "Dentist");
  b.ev(6, "08:00", "09:30", "Long run");
  // Not selected by default: shows the calendar picker working.
  b.ev(1, "16:00", "18:00", "Soccer game", { cal: "family" });
  void skipToday;
}

function baseState(now: Date, today: LocalDate, tz: string, mode: "demo" | "live" = "demo"): AppState {
  const s = createInitialState({ mode, timezone: tz, displayName: "Demo visitor", now });
  s.profile.onboarded = true;
  s.prefs.flavorRank = ["matcha", "chai"];
  s.prefs.provenance = { flavorRank: "explicit", timing: "explicit", timezone: "explicit", caffeineCutoff: "explicit" };
  s.calendar = {
    status: "connected",
    provider: "demo",
    isDemo: true,
    calendars: [
      { id: "primary", name: "Personal", selected: true },
      { id: "work", name: "Work", selected: true },
      { id: "family", name: "Family", selected: false },
    ],
    lastSyncAt: now.toISOString(),
    lastSyncSummary: "Demo fixtures loaded. This is not a live Google Calendar connection.",
    lastError: null,
    nextSyncAt: null,
    syncIntervalMinutes: syncDefaults.intervalMinutes,
    scopes: [],
  };
  const stock: Record<Flavor, number> = { chai: 8, oolong: 7, matcha: 6 };
  for (const f of Object.keys(stock) as Flavor[]) {
    s.inventory.push({ id: newId("inv"), flavor: f, delta: stock[f], reason: "correction", basis: "logged", at: addDays(today, -3) + "T12:00:00.000Z" });
    s.stockCorrectedAt[f] = addDays(today, -3) + "T12:00:00.000Z";
  }
  s.subscription = {
    status: "active",
    cadence: "monthly",
    cans: 24,
    priceCents: 7200,
    mix: { chai: 8, oolong: 8, matcha: 8 },
    shipments: [
      { id: newId("shp"), date: addDays(today, -20), status: "delivered", mix: { chai: 8, oolong: 8, matcha: 8 } },
      { id: newId("shp"), date: addDays(today, 10), status: "scheduled", mix: { chai: 8, oolong: 8, matcha: 8 } },
    ],
    updatedAt: now.toISOString(),
  };
  return s;
}

function addHistory(s: AppState, today: LocalDate, tz: string, days: number) {
  const flavors: Flavor[] = ["chai", "oolong", "matcha"];
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i);
    const f = flavors[i % 3]!;
    const at = isoOf(zonedToUtcMs(date, 8 * 60 + 30, tz));
    s.consumption.push({ id: newId("con"), flavor: f, at, localDate: date, caffeine: { mg: null, status: "unknown" }, recommendationId: null, idempotencyKey: `seed-${date}`, voidedAt: null });
  }
  // History caffeine is resolved lazily at display time; seed with illustrative values for demo mode.
  for (const c of s.consumption) {
    const v = { chai: 40, oolong: 30, matcha: 35 }[c.flavor];
    c.caffeine = { mg: v, status: "illustrative" };
  }
}

export async function buildScenario(id: string, real: Date = new Date()): Promise<AppState> {
  const meta = SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0]!;
  const tz = DEMO_TZ;
  let today = localDateOf(real.getTime(), tz);
  if (meta.id === "dst-boundary") today = "2027-03-13";
  const now = new Date(zonedToUtcMs(today, parseHHmm(meta.nowAt), tz));
  const s = baseState(now, today, tz);
  s.scenario = meta.id;
  s.demoNowIso = now.toISOString();
  const b = new Builder(tz, today);
  baselineWeek(b);

  switch (meta.id) {
    case "busy-morning":
      b.ev(0, "06:30", "07:30", "Strength training");
      b.ev(0, "09:30", "12:00", "Quarterly planning", { cal: "work" });
      b.ev(0, "13:00", "15:30", "Customer workshop", { cal: "work" });
      b.ev(0, "16:00", "17:00", "Hiring sync", { cal: "work" });
      break;
    case "quiet-workout":
      b.ev(0, "12:00", "13:00", "Yoga flow");
      b.ev(0, "15:00", "15:30", "Check-in call", { cal: "work" });
      break;
    case "busy-no-workout":
      b.ev(0, "09:00", "10:30", "Planning review", { cal: "work" });
      b.ev(0, "11:00", "12:30", "Vendor calls", { cal: "work" });
      b.ev(0, "14:00", "15:30", "Board prep", { cal: "work" });
      b.ev(0, "15:30", "16:30", "Interview loop", { cal: "work" });
      break;
    case "evening-cutoff":
      b.ev(0, "11:00", "11:30", "Standup", { cal: "work" });
      b.ev(0, "18:00", "19:00", "Spin class");
      break;
    case "ambiguous-title":
      b.ev(0, "12:30", "13:30", "Session with Dana");
      b.ev(0, "10:00", "11:00", "Run of show review", { cal: "work" });
      b.ev(0, "15:00", "17:00", "Compliance training", { cal: "work" });
      break;
    case "recurring-rescheduled": {
      const old = zonedToUtcMs(today, parseHHmm("07:00"), tz);
      const e = b.ev(0, "08:00", "09:00", "Morning spin", { recurring: "spin-series", origStart: isoOf(old) });
      b.ev(1, "07:00", "08:00", "Morning spin", { recurring: "spin-series", origStart: isoOf(zonedToUtcMs(b.d(1), parseHHmm("07:00"), tz)) });
      b.events = b.events.filter((x) => !(x.title === "Gym — upper body"));
      b.ev(0, "10:30", "11:30", "Team meeting", { cal: "work" });
      b.ev(0, "14:00", "16:30", "Quarterly review", { cal: "work" });
      void e;
      break;
    }
    case "overlapping-events":
      b.ev(0, "07:00", "08:00", "Gym");
      b.ev(0, "09:00", "12:00", "Offsite workshop", { cal: "work" });
      b.ev(0, "10:00", "13:00", "Customer onsite", { cal: "primary" });
      b.ev(0, "11:00", "11:30", "Coffee chat", { cal: "primary" });
      b.ev(0, "12:00", "12:30", "Tentative lunch (free)", { cal: "primary", transparent: true });
      b.ev(0, "14:00", "15:00", "Declined review", { cal: "work", declined: true });
      b.ev(0, "00:00", "23:59", "Conference day (all-day)", { cal: "work", allDay: true });
      break;
    case "no-slots":
      b.ev(0, "07:00", "08:00", "Gym");
      b.ev(0, "08:00", "12:00", "Back-to-back meetings", { cal: "work" });
      b.ev(0, "12:00", "17:00", "All-hands & reviews", { cal: "work" });
      break;
    case "unknown-caffeine":
      b.ev(0, "07:00", "08:00", "Pilates");
      b.ev(0, "11:00", "12:00", "Roadmap", { cal: "work" });
      s.caffeineOverrides = { chai: { mg: null, status: "unknown" }, oolong: { mg: null, status: "unknown" }, matcha: { mg: null, status: "unknown" } };
      break;
    case "two-drinks":
      b.ev(0, "12:30", "13:30", "Strength training");
      b.ev(0, "15:00", "16:00", "Planning", { cal: "work" });
      for (const [f, at] of [["chai", "07:10"], ["oolong", "11:00"]] as [Flavor, string][]) {
        s.consumption.push({ id: newId("con"), flavor: f, at: isoOf(zonedToUtcMs(today, parseHHmm(at), tz)), localDate: today, caffeine: { mg: f === "chai" ? 40 : 30, status: "illustrative" }, recommendationId: null, idempotencyKey: `seed-${f}`, voidedAt: null });
        s.inventory.push({ id: newId("inv"), flavor: f, delta: -1, reason: "consumption", basis: "logged", at: isoOf(zonedToUtcMs(today, parseHHmm(at), tz)) });
      }
      s.externalCaffeine.push({ id: newId("ext"), label: "Coffee (8 oz)", mg: 95, at: isoOf(zonedToUtcMs(today, parseHHmm("07:45"), tz)), localDate: today, voidedAt: null });
      break;
    case "low-inventory":
      b.ev(0, "06:30", "07:30", "Gym");
      b.ev(0, "12:00", "13:00", "Lunch workout — spin");
      s.inventory = [];
      for (const [f, n] of [["chai", 0], ["oolong", 1], ["matcha", 0]] as [Flavor, number][]) {
        s.inventory.push({ id: newId("inv"), flavor: f, delta: n, reason: "correction", basis: "logged", at: addDays(today, -1) + "T12:00:00.000Z" });
      }
      s.subscription.shipments = [
        { id: newId("shp"), date: addDays(today, -20), status: "delivered", mix: { chai: 8, oolong: 8, matcha: 8 } },
        { id: newId("shp"), date: addDays(today, 12), status: "scheduled", mix: { chai: 8, oolong: 8, matcha: 8 } },
      ];
      addHistory(s, today, tz, 10);
      break;
    case "dst-boundary":
      // Sat 2027-03-13 (evening "now"); Sun 2027-03-14 is the 23-hour spring-forward day in America/Chicago.
      b.events = [];
      b.ev(0, "07:00", "08:00", "Gym");
      b.ev(1, "07:00", "08:00", "Sunday long run");
      b.ev(1, "09:30", "11:00", "Brunch with family");
      b.ev(2, "07:00", "08:00", "Gym");
      b.ev(2, "10:00", "14:30", "Planning day", { cal: "work" });
      b.ev(3, "18:00", "19:00", "Yoga");
      b.ev(4, "12:00", "13:00", "Lunch workout");
      break;
  }
  s.events = b.events;

  await classifyPending(s, mockAi);
  recompute(s, now, { trigger: "scenario_load" });
  if (meta.id === "recurring-rescheduled") {
    // The user accepted a drink against the ORIGINAL 07:00-08:00 spin; the series instance has since moved
    // to 08:00-09:00. The planner re-checks the accepted drink and explains the change.
    const moved = s.events.find((e) => e.title === "Morning spin" && localDateOf(Date.parse(e.startUtc), tz) === today);
    const rec = moved && s.recommendations.find((r) => r.eventRefs[0] === moved.key && r.status === "proposed");
    if (moved && rec) {
      const oldEnd = zonedToUtcMs(today, parseHHmm("08:00"), tz) - 60 * 60_000;
      rec.status = "accepted";
      rec.acceptedAt = now.toISOString();
      rec.anchorUtc = isoOf(oldEnd);
      rec.startUtc = isoOf(oldEnd + 30 * 60_000);
      recompute(s, now, { trigger: "calendar_changed" });
    }
  }
  return s;
}
