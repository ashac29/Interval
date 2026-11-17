import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { activeEvents, busyIntervalsForDay, countsAsBusy, freeGaps, occupiedHours, overlaps } from "./busy";
import { interpretEvent } from "./classify";
import { dayBounds, localMinutesOf, parseHHmm, zonedToUtcMs } from "./time";
import type { AppState, CalEvent, Interval, LocalDate, RecKind } from "./types";

/**
 * Candidate slot generation. Application code (not the model) decides which
 * slots are eligible: workout-anchored slots, plus an optional busy-day gap.
 * Policy validation and scoring happen afterwards.
 */

export interface Candidate {
  kind: RecKind;
  startMs: number;
  /** Workout end (post), workout start (pre), or null for gap candidates. */
  anchorMs: number | null;
  eventRefs: string[];
  workoutType: string | null;
  workoutUsable: boolean;
  offsetMin: number;
  gapMinutes: number;
  limitedFreeAfter: boolean;
}

export interface DayContext {
  date: LocalDate;
  busy: Interval[];
  busyHours: number;
  busyDay: boolean;
  workouts: { event: CalEvent; type: string; confirmed: boolean }[];
  needsConfirmation: CalEvent[];
  windowStartMs: number;
  windowEndMs: number;
}

export function dayContext(state: AppState, date: LocalDate, _cfg: PolicyConfig = defaultPolicy): DayContext {
  const tz = state.prefs.timezone;
  const events = activeEvents(state);
  const busy = busyIntervalsForDay(events, date, tz);
  const busyHours = occupiedHours(busy);
  const { startMs, endMs } = dayBounds(date, tz);
  const workouts: DayContext["workouts"] = [];
  const needsConfirmation: CalEvent[] = [];
  for (const e of events) {
    if (e.status === "cancelled" || e.selfResponse === "declined" || e.allDay) continue;
    const s = Date.parse(e.startUtc);
    if (s < startMs || s >= endMs) continue;
    const interp = interpretEvent(state, e);
    if (interp.kind === "workout") workouts.push({ event: e, type: interp.workoutType, confirmed: interp.confirmed });
    else if (interp.kind === "needs_confirmation") needsConfirmation.push(e);
  }
  workouts.sort((a, b) => Date.parse(a.event.startUtc) - Date.parse(b.event.startUtc));
  const quietEnd = parseHHmm(state.prefs.quietHours.end);
  const earliest = Math.max(quietEnd, 6 * 60);
  const cutoff = parseHHmm(state.prefs.caffeineCutoff);
  return {
    date,
    busy,
    busyHours,
    busyDay: busyHours >= state.prefs.busyHoursThreshold,
    workouts,
    needsConfirmation,
    windowStartMs: zonedToUtcMs(date, earliest, tz),
    windowEndMs: zonedToUtcMs(date, cutoff, tz),
  };
}

function fits(startMs: number, ctx: DayContext, cfg: PolicyConfig): { ok: boolean; gapMin: number } {
  const win = cfg.timing.drinkWindowMinutes * 60_000;
  if (startMs < ctx.windowStartMs || startMs > ctx.windowEndMs) return { ok: false, gapMin: 0 };
  if (overlaps({ startMs, endMs: startMs + win }, ctx.busy)) return { ok: false, gapMin: 0 };
  const next = ctx.busy.find((b) => b.startMs >= startMs);
  const prev = [...ctx.busy].reverse().find((b) => b.endMs <= startMs);
  const gapStart = prev ? Math.max(prev.endMs, ctx.windowStartMs) : ctx.windowStartMs;
  const gapEnd = next ? next.startMs : ctx.windowEndMs + 60 * 60_000;
  const gapMin = Math.round((gapEnd - gapStart) / 60_000);
  return { ok: gapEnd - startMs >= cfg.timing.minFreeGapMinutes * 60_000, gapMin };
}

export function generateCandidates(state: AppState, ctx: DayContext, cfg: PolicyConfig = defaultPolicy, nowMs = 0, blockers: Set<string> = new Set()): Candidate[] {
  const out: Candidate[] = [];
  const tz = state.prefs.timezone;
  const pref = state.prefs.timing;
  const allowPost = pref !== "before";
  const allowPre = pref !== "after";
  const dayEnd = ctx.windowEndMs + 6 * 60 * 60_000;

  for (const w of ctx.workouts) {
    const ws = Date.parse(w.event.startUtc);
    const we = Date.parse(w.event.endUtc);
    const ref = [w.event.key];
    if (allowPost) {
      let placed = false;
      for (const off of cfg.timing.afterWorkoutOffsets) {
        const start = we + off * 60_000;
        if (start < nowMs) continue;
        const f = fits(start, ctx, cfg);
        if (f.ok) {
          placed = true;
          const freeAfter = freeGaps(ctx.busy, start, Math.min(dayEnd, dayBounds(ctx.date, tz).endMs)).reduce((s, g) => s + (g.endMs - g.startMs), 0) / 3_600_000;
          out.push({
            kind: "post_workout",
            startMs: start,
            anchorMs: we,
            eventRefs: ref,
            workoutType: w.type,
            workoutUsable: true,
            offsetMin: off,
            gapMinutes: f.gapMin,
            limitedFreeAfter: freeAfter < cfg.timing.limitedFreeHoursAfter || ctx.busyDay,
          });
          break;
        }
      }
      if (!placed) {
        const first = we + cfg.timing.afterWorkoutOffsets[0]! * 60_000;
        if (first < nowMs && we + 90 * 60_000 < nowMs) blockers.add("workout_passed");
        else if (first > ctx.windowEndMs) blockers.add("after_cutoff");
        else if (first < ctx.windowStartMs) blockers.add("quiet_hours");
        else blockers.add("no_gap");
      }
    }
    if (allowPre) {
      let placedPre = false;
      for (const off of cfg.timing.beforeWorkoutOffsets) {
        const start = ws - off * 60_000;
        if (start < nowMs) continue;
        const f = fits(start, ctx, cfg);
        if (f.ok) {
          placedPre = true;
          out.push({
            kind: "pre_workout",
            startMs: start,
            anchorMs: ws,
            eventRefs: ref,
            workoutType: w.type,
            workoutUsable: true,
            offsetMin: -off,
            gapMinutes: f.gapMin,
            limitedFreeAfter: false,
          });
          break;
        }
      }
      if (!placedPre && !allowPost) blockers.add(ws - 45 * 60_000 > ctx.windowEndMs ? "after_cutoff" : "no_gap");
    }
  }

  // Busy-day gap suggestion (optional; off when the user wants workout-only suggestions).
  if (state.prefs.busyDaySuggestions && ctx.busyDay) {
    const earliest = Math.max(ctx.windowStartMs, zonedToUtcMs(ctx.date, parseHHmm(cfg.timing.busyGapEarliest), tz), nowMs + 5 * 60_000);
    const gaps = freeGaps(ctx.busy, earliest, ctx.windowEndMs).filter((g) => g.endMs - g.startMs >= cfg.timing.minFreeGapMinutes * 60_000);
    gaps.sort((a, b) => b.endMs - b.startMs - (a.endMs - a.startMs));
    const g = gaps[0];
    if (g) {
      const start = g.startMs + 10 * 60_000;
      const f = fits(start, ctx, cfg);
      if (f.ok) {
        out.push({
          kind: "busy_gap",
          startMs: start,
          anchorMs: null,
          eventRefs: [],
          workoutType: null,
          workoutUsable: false,
          offsetMin: localMinutesOf(start, tz),
          gapMinutes: Math.round((g.endMs - g.startMs) / 60_000),
          limitedFreeAfter: false,
        });
      }
    }
  }
  return out;
}

export { countsAsBusy };
