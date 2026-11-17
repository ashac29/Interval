import { activeEvents, countsAsBusy } from "@/lib/domain/busy";
import { dayContext } from "@/lib/domain/candidates";
import { interpretEvent } from "@/lib/domain/classify";
import { nextShipment } from "@/lib/domain/commerce";
import { addDays, dayBounds, formatDayLong, formatDayShort, formatTime, localDateOf, weekStartOf, weekdayName, weekdayOf } from "@/lib/domain/time";
import { dayTally, stockByFlavor, type DayTally } from "@/lib/domain/validate";
import type { AppState, CalEvent, DayPlanNote, LocalDate, Recommendation } from "@/lib/domain/types";

export interface AgendaItem {
  key: string;
  title: string;
  startMs: number;
  endMs: number;
  start: string;
  end: string;
  calendar: string;
  kind: "workout" | "busy" | "needs_confirmation" | "excluded";
  workoutType?: string;
  confirmed?: boolean;
  reason?: string;
  excludedReason?: string;
  recurring: boolean;
  confidence?: number;
  classificationReason?: string;
}

function agendaItem(state: AppState, e: CalEvent): AgendaItem {
  const tz = state.prefs.timezone;
  const cal = state.calendar.calendars.find((c) => c.id === e.calendarId)?.name ?? "Calendar";
  const base = {
    key: e.key,
    title: e.title,
    startMs: Date.parse(e.startUtc),
    endMs: Date.parse(e.endUtc),
    start: e.allDay ? "All day" : formatTime(Date.parse(e.startUtc), tz),
    end: formatTime(Date.parse(e.endUtc), tz),
    calendar: cal,
    recurring: Boolean(e.recurringEventId),
  };
  if (!countsAsBusy(e)) {
    const reason = e.status === "cancelled" ? "Cancelled" : e.selfResponse === "declined" ? "Declined" : e.allDay ? "All-day (not counted as busy)" : "Marked free (not counted as busy)";
    return { ...base, kind: "excluded", excludedReason: reason };
  }
  const i = interpretEvent(state, e);
  if (i.kind === "workout") return { ...base, kind: "workout", workoutType: i.workoutType, confirmed: i.confirmed, reason: i.classification.reason, confidence: i.classification.confidence };
  if (i.kind === "needs_confirmation") return { ...base, kind: "needs_confirmation", reason: i.classification.reason, confidence: i.classification.confidence, classificationReason: i.classification.reason };
  return { ...base, kind: "busy" };
}

export function agendaFor(state: AppState, date: LocalDate): AgendaItem[] {
  const { startMs, endMs } = dayBounds(date, state.prefs.timezone);
  return activeEvents(state)
    .filter((e) => {
      const s = Date.parse(e.startUtc);
      return (e.allDay ? localDateOf(s, e.timezone ?? state.prefs.timezone) === date : s >= startMs && s < endMs) && e.status !== "cancelled";
    })
    .map((e) => agendaItem(state, e))
    .sort((a, b) => (a.start === "All day" ? -1 : b.start === "All day" ? 1 : a.startMs - b.startMs));
}

export interface TodayView {
  date: LocalDate;
  label: string;
  headline: string;
  subhead: string;
  next: Recommendation | null;
  later: Recommendation[];
  open: Recommendation[];
  agenda: AgendaItem[];
  tally: DayTally;
  stockTotal: number;
  stock: Record<string, number>;
  ship: { date: string; cans: number } | null;
  note: DayPlanNote | null;
  needsConfirmation: AgendaItem[];
  busyHours: number;
  consumedToday: AppState["consumption"];
  externalToday: AppState["externalCaffeine"];
  conflicts: Recommendation[];
}

export function todayView(state: AppState, now: Date): TodayView {
  const tz = state.prefs.timezone;
  const date = localDateOf(now.getTime(), tz);
  const ctx = dayContext(state, date);
  const open = state.recommendations.filter((r) => (r.status === "proposed" || r.status === "accepted") && r.localDate === date).sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
  const upcoming = open.filter((r) => Date.parse(r.startUtc) + 90 * 60_000 >= now.getTime());
  const tally = dayTally(state, date);
  const agenda = agendaFor(state, date);
  const workouts = ctx.workouts.length;
  let headline = "A calm day.";
  let subhead = "Nothing needs planning right now.";
  if (tally.capReached) {
    headline = "You’re set for today.";
    subhead = `${tally.counted} of your ${tally.cap}-drink limit counted. No more suggestions today.`;
  } else if (ctx.busyDay && workouts > 0) {
    headline = "Packed day ahead.";
    subhead = `${workouts === 1 ? "A workout" : `${workouts} workouts`} and about ${Math.round(ctx.busyHours * 10) / 10} hours of events.`;
  } else if (ctx.busyDay) {
    headline = "Packed day, no workout.";
    subhead = `About ${Math.round(ctx.busyHours * 10) / 10} hours of events. Open gaps are scarce.`;
  } else if (workouts > 0) {
    headline = "A workout day with room to breathe.";
    subhead = `${workouts === 1 ? "One workout" : `${workouts} workouts`} on your calendar, and a light schedule around it.`;
  } else if (agenda.some((a) => a.kind === "needs_confirmation")) {
    headline = "One thing to confirm.";
    subhead = "An event might be a workout. Confirm it to plan around it.";
  }
  const sub = nextShipment(state);
  const stock = stockByFlavor(state);
  const note = state.planRuns[0]?.days.find((d) => d.date === date) ?? null;
  return {
    date,
    label: formatDayLong(date),
    headline,
    subhead,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1),
    open,
    agenda,
    tally,
    stockTotal: Object.values(stock).reduce((a, b) => a + b, 0),
    stock,
    ship: sub ? { date: sub.date, cans: Object.values(sub.mix).reduce((a, b) => a + b, 0) } : null,
    note,
    needsConfirmation: agenda.filter((a) => a.kind === "needs_confirmation"),
    busyHours: Math.round(ctx.busyHours * 10) / 10,
    consumedToday: state.consumption.filter((c) => !c.voidedAt && localDateOf(Date.parse(c.at), tz) === date).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    externalToday: state.externalCaffeine.filter((c) => !c.voidedAt && localDateOf(Date.parse(c.at), tz) === date),
    conflicts: state.recommendations.filter((r) => r.conflict && (r.status === "proposed" || r.status === "accepted")),
  };
}

export interface DayView {
  date: LocalDate;
  label: string;
  short: string;
  weekday: string;
  isToday: boolean;
  isPast: boolean;
  hours: number;
  agenda: AgendaItem[];
  recs: Recommendation[];
  completed: Recommendation[];
  withdrawn: Recommendation[];
  note: DayPlanNote | null;
  busyHours: number;
  busyDay: boolean;
  tally: DayTally;
}

export function weekView(state: AppState, now: Date, offsetWeeks = 0) {
  const tz = state.prefs.timezone;
  const today = localDateOf(now.getTime(), tz);
  const weekStart = addDays(weekStartOf(today), offsetWeeks * 7);
  const days: DayView[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const ctx = dayContext(state, date);
    const b = dayBounds(date, tz);
    const recs = state.recommendations.filter((r) => r.localDate === date);
    days.push({
      date,
      label: formatDayLong(date),
      short: formatDayShort(date),
      weekday: weekdayName(weekdayOf(date), false),
      isToday: date === today,
      isPast: date < today,
      hours: Math.round((b.endMs - b.startMs) / 360_000) / 10,
      agenda: agendaFor(state, date),
      recs: recs.filter((r) => r.status === "proposed" || r.status === "accepted").sort((a, b2) => Date.parse(a.startUtc) - Date.parse(b2.startUtc)),
      completed: recs.filter((r) => r.status === "completed"),
      withdrawn: recs.filter((r) => r.status === "invalidated" && r.conflict),
      note: state.planRuns[0]?.days.find((d) => d.date === date) ?? null,
      busyHours: Math.round(ctx.busyHours * 10) / 10,
      busyDay: ctx.busyDay,
      tally: dayTally(state, date),
    });
  }
  return { weekStart, today, days };
}
