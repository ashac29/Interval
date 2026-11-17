import { POLICY_VERSION, SCORING_VERSION, policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { FLAVORS, type Flavor } from "@/config/products";
import { activeEvents, busyIntervalsForDay, overlaps } from "./busy";
import { generateCandidates, dayContext, type Candidate } from "./candidates";
import { getProduct, resolveCaffeine } from "./catalog";
import { interpretEvent } from "./classify";
import { recordFeedback } from "./feedback";
import { newId } from "./ids";
import { deriveLearning } from "./learning";
import { cancelRemindersFor, syncReminders } from "./reminders";
import { scoreCandidate } from "./score";
import { addDays, formatClock, formatTime, isoOf, localDateOf } from "./time";
import { dateOf, drinkCap, validateCandidate, type Violation } from "./validate";
import type { AppState, DayPlanNote, LocalDate, PlanRun, Recommendation } from "./types";

const ACTIVE: Recommendation["status"][] = ["proposed", "accepted"];

export function planningDates(state: AppState, now: Date, cfg: PolicyConfig = defaultPolicy): LocalDate[] {
  const today = localDateOf(now.getTime(), state.prefs.timezone);
  return Array.from({ length: cfg.timing.maxPlanningDaysAhead }, (_, i) => addDays(today, i));
}

function invalidate(state: AppState, r: Recommendation, code: string, message: string, now: Date) {
  r.status = "invalidated";
  r.conflict = { code, message };
  r.updatedAt = now.toISOString();
  cancelRemindersFor(state, r.id, `invalidated:${code}`, now);
  recordFeedback(state, "rec_invalidated", { code, kind: r.kind }, now, r.id);
}

/** How the recommendation's calendar anchor looks now. */
function anchorState(state: AppState, r: Recommendation): "ok" | "moved" | "removed" {
  if (r.kind === "busy_gap" || r.eventRefs.length === 0) return "ok";
  const ev = activeEvents(state).find((e) => e.key === r.eventRefs[0]);
  if (!ev || ev.status === "cancelled" || ev.selfResponse === "declined" || ev.allDay) return "removed";
  if (interpretEvent(state, ev).kind !== "workout") return "removed";
  const anchor = r.kind === "post_workout" ? ev.endUtc : ev.startUtc;
  if (r.anchorUtc && Date.parse(anchor) !== Date.parse(r.anchorUtc)) return "moved";
  return "ok";
}

function currentAnchor(state: AppState, r: Recommendation): string | null {
  const ev = activeEvents(state).find((e) => e.key === r.eventRefs[0]);
  if (!ev) return r.anchorUtc;
  return r.kind === "post_workout" ? ev.endUtc : ev.startUtc;
}

const blockingViolations = (vs: Violation[]) => vs.filter((v) => v.code !== "in_past");

export function recompute(state: AppState, now: Date, opts: { trigger: string; cfg?: PolicyConfig }): PlanRun {
  const cfg = opts.cfg ?? defaultPolicy;
  const tz = state.prefs.timezone;
  const nowIso = now.toISOString();
  const run: PlanRun = {
    id: newId("run"),
    at: nowIso,
    trigger: opts.trigger,
    policyVersion: POLICY_VERSION,
    scoringVersion: SCORING_VERSION,
    days: [],
    created: 0,
    invalidated: 0,
    expired: 0,
    kept: 0,
  };
  const countStatus = () => state.recommendations.filter((r) => r.status === "invalidated").length;
  const invalidatedBefore = countStatus();

  // 1. Expire anything whose time has passed without completion.
  for (const r of state.recommendations) {
    if (ACTIVE.includes(r.status) && Date.parse(r.startUtc) + cfg.timing.expireGraceMinutes * 60_000 < now.getTime()) {
      r.status = "expired";
      r.updatedAt = nowIso;
      cancelRemindersFor(state, r.id, "expired", now);
      run.expired++;
    }
  }

  // 2. Revalidate surviving suggestions against the current calendar and policy.
  //    Everything is lifted out of the "reserving" pool first and re-added in time order,
  //    so the earliest valid items win when a cap/ceiling is no longer satisfiable.
  const toCheck = state.recommendations.filter((r) => ACTIVE.includes(r.status)).sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
  const originalStatus = new Map(toCheck.map((r) => [r.id, r.status]));
  for (const r of toCheck) r.status = "invalidated"; // temporarily non-reserving
  const accepted = toCheck.filter((r) => originalStatus.get(r.id) === "accepted");
  const proposed = toCheck.filter((r) => originalStatus.get(r.id) === "proposed");
  for (const r of [...accepted, ...proposed]) {
    const wasAccepted = originalStatus.get(r.id) === "accepted";
    const anchor = anchorState(state, r);
    const dateStr = dateOf(state, r.startUtc);
    const busy = busyIntervalsForDay(activeEvents(state), dateStr, tz);
    const startMs = Date.parse(r.startUtc);
    const overlapsBusy = overlaps({ startMs, endMs: startMs + cfg.timing.drinkWindowMinutes * 60_000 }, busy);
    const check = validateCandidate(state, { id: r.id, flavor: r.flavor, startUtc: r.startUtc }, { mode: wasAccepted ? "accept" : "propose", now, cfg });
    const hard = blockingViolations(check.violations);
    const manual = r.manual.timeEdited || r.manual.flavorEdited;
    const restore = () => {
      r.status = wasAccepted ? "accepted" : "proposed";
      run.kept++;
    };
    const drop = (code: string, msg: string) => {
      r.status = originalStatus.get(r.id) ?? "proposed";
      invalidate(state, r, code, msg, now);
    };

    if (anchor === "removed") {
      if (manual && hard.length === 0 && !overlapsBusy) {
        r.conflict = { code: "workout_removed", message: "The workout this was based on is no longer on your calendar. Your edited time still works, so it was kept." };
        r.updatedAt = nowIso;
        restore();
      } else {
        drop("workout_removed", "The workout this was based on is no longer on your calendar, so this suggestion no longer applies.");
      }
      continue;
    }
    if (hard.length > 0) {
      drop(hard[0]!.code, `${hard[0]!.message} This suggestion was withdrawn${wasAccepted ? " and its reminder cancelled" : ""}.`);
      continue;
    }
    if (anchor === "moved") {
      if ((wasAccepted || manual) && !overlapsBusy) {
        r.anchorUtc = currentAnchor(state, r);
        r.conflict = { code: "workout_moved", message: "Your workout moved. This time still fits your calendar — keep it or edit it." };
        r.updatedAt = nowIso;
        restore();
      } else if (wasAccepted || manual) {
        drop("workout_moved_conflict", "Your workout moved and this time now overlaps something on your calendar. Pick a new time or accept a fresh suggestion.");
      } else {
        drop("superseded", "Your workout moved, so a new suggestion replaces this one.");
      }
      continue;
    }
    if (overlapsBusy && wasAccepted) {
      r.conflict = { code: "calendar_overlap", message: "A calendar event now overlaps this time. Keep it or edit it." };
      r.updatedAt = nowIso;
    }
    restore();
  }
  run.invalidated = countStatus() - invalidatedBefore;
  // Invalidated-while-checking counts above include only those newly dropped (the temp marker was reverted in `drop`).

  // 3. Propose new suggestions day by day.
  const learned = deriveLearning(state, cfg);
  for (const date of planningDates(state, now, cfg)) {
    const ctx = dayContext(state, date, cfg);
    const note: DayPlanNote = { date, reasonCodes: [], messages: [], busyHours: Math.round(ctx.busyHours * 10) / 10, workouts: ctx.workouts.length };
    const cap = drinkCap(state, cfg);
    const completed = state.consumption.filter((c) => !c.voidedAt && dateOf(state, c.at) === date).length;
    const active = state.recommendations.filter((r) => ACTIVE.includes(r.status) && dateOf(state, r.startUtc) === date);
    const allowed = Math.min(cap, ctx.workouts.length >= 2 ? cfg.timing.proposalsPerDayWithTwoWorkouts : cfg.timing.proposalsPerDay);
    let need = allowed - completed - active.length;
    if (ctx.needsConfirmation.length > 0) {
      note.reasonCodes.push("workout_needs_confirmation");
      note.messages.push(`${ctx.needsConfirmation.length} event${ctx.needsConfirmation.length === 1 ? "" : "s"} might be workouts. Confirm them to use them for suggestions.`);
    }
    if (need <= 0) {
      const atCap = completed + active.length >= cap;
      note.reasonCodes.push(atCap && cap > 0 ? "cap_reached" : cap === 0 ? "cap_zero" : "day_covered");
      note.messages.push(
        atCap && cap > 0
          ? `You’re at your limit of ${cap} for this day, so no more suggestions.`
          : cap === 0
            ? "Your drink limit is set to zero."
            : "You already have a drink for this day. Suggestions are a ceiling, not a target.",
      );
      run.days.push(note);
      continue;
    }
    const blockers = new Set<string>();
    const cands = generateCandidates(state, ctx, cfg, now.getTime(), blockers);
    if (cands.length === 0) {
      if (ctx.workouts.length > 0) {
        const b = [...blockers][0] ?? "no_gap";
        note.reasonCodes.push(b === "workout_passed" ? "workout_passed" : b === "after_cutoff" ? "past_cutoff" : "no_eligible_slot");
        note.messages.push(
          b === "workout_passed"
            ? "Today\u2019s workout is already over and no later window fits."
            : b === "after_cutoff"
              ? `Your workout ends after your ${formatClock(state.prefs.caffeineCutoff)} caffeine cutoff, so nothing is suggested.`
              : b === "quiet_hours"
                ? "The only window would fall inside your quiet hours."
                : "No open slot after or before your workout fits your calendar, quiet hours and caffeine cutoff.",
        );
      } else {
        note.reasonCodes.push("no_trigger");
        note.messages.push(
          ctx.busyDay && !state.prefs.busyDaySuggestions
            ? "Busy day, but suggestions for busy days without a workout are off."
            : "No confirmed workout or busy stretch, so no suggestion needed.",
        );
      }
      run.days.push(note);
      continue;
    }

    // Evaluate every flavor for every slot; keep the best valid pair per slot.
    interface Scored {
      cand: Candidate;
      flavor: Flavor;
      total: number;
      rec: Recommendation;
    }
    const scored: Scored[] = [];
    const failures = new Map<string, string>();
    for (const cand of cands) {
      const startIso = isoOf(cand.startMs);
      const dupe = state.recommendations.some(
        (r) => (ACTIVE.includes(r.status) || r.status === "dismissed" || r.status === "completed") && r.localDate === date && r.kind === cand.kind && (r.eventRefs[0] ?? "") === (cand.eventRefs[0] ?? ""),
      );
      if (dupe) continue;
      let best: Scored | null = null;
      for (const flavor of FLAVORS) {
        const v = validateCandidate(state, { flavor, startUtc: startIso }, { mode: "propose", now, cfg });
        if (!v.ok) {
          for (const x of v.violations) if (x.code !== "in_past") failures.set(x.code, x.code === "unknown_caffeine" ? "Caffeine content isn\u2019t established for the flavors that fit, so suggestions are paused." : x.message);
          continue;
        }
        const breakdown = scoreCandidate(
          {
            kind: cand.kind,
            date,
            flavor,
            prefs: state.prefs,
            workoutUsable: cand.workoutUsable,
            workoutType: cand.workoutType,
            limitedFreeAfter: cand.limitedFreeAfter,
            busyDay: ctx.busyDay,
            gapMinutes: cand.gapMinutes,
            offsetMin: cand.offsetMin,
            sameFlavorAlreadyToday: state.recommendations.some((r) => ["proposed", "accepted", "completed"].includes(r.status) && r.flavor === flavor && Math.abs(Date.parse(r.startUtc) - cand.startMs) < 30 * 3_600_000),
            learned,
          },
          cfg,
        );
        const rec = buildRec(state, cand, flavor, breakdown, date, nowIso, ctx.busyHours);
        if (!best || breakdown.total > best.total) best = { cand, flavor, total: breakdown.total, rec };
      }
      if (best) scored.push(best);
    }
    scored.sort((a, b) => b.total - a.total);
    const chosen: Scored[] = [];
    const usedWorkouts = new Set<string>();
    for (const s of scored) {
      if (need <= 0) break;
      const wk = s.cand.eventRefs[0];
      if (wk && usedWorkouts.has(wk)) continue; // one suggestion per workout
      if (!wk && (chosen.length > 0 || active.length > 0)) continue; // busy-gap suggestion only when nothing else covers the day
      // Keep drinks at least two hours apart, including already-active ones.
      const tooClose = [...chosen.map((c) => Date.parse(c.rec.startUtc)), ...active.map((r) => Date.parse(r.startUtc))].some((t) => Math.abs(t - Date.parse(s.rec.startUtc)) < cfg.timing.minSpacingMinutes * 60_000);
      if (tooClose) continue;
      // Re-validate with previously chosen proposals reserving cap/caffeine/stock.
      state.recommendations.push(s.rec);
      const again = validateCandidate(state, { id: s.rec.id, flavor: s.rec.flavor, startUtc: s.rec.startUtc }, { mode: "propose", now, cfg });
      if (!again.ok) {
        state.recommendations.pop();
        for (const x of again.violations) failures.set(x.code, x.message);
        continue;
      }
      chosen.push(s);
      if (wk) usedWorkouts.add(wk);
      need--;
      run.created++;
    }
    if (chosen.length === 0 && active.length === 0) {
      const codes = [...failures.keys()];
      if (codes.length === 0 && scored.length === 0) {
        note.reasonCodes.push("already_handled");
        note.messages.push("Earlier suggestions for this day were dismissed or completed.");
      }
      for (const [code, msg] of failures) {
        note.reasonCodes.push(code);
        note.messages.push(msg);
      }
    }
    run.days.push(note);
  }

  // 4. Keep reminder jobs in step with the accepted plan.
  syncReminders(state, now, cfg);

  state.planRuns.unshift(run);
  state.planRuns = state.planRuns.slice(0, 20);
  return run;
}

function buildRec(
  state: AppState,
  cand: Candidate,
  flavor: Flavor,
  score: Recommendation["score"],
  date: LocalDate,
  nowIso: string,
  busyHours: number,
): Recommendation {
  const tz = state.prefs.timezone;
  const t = formatTime(cand.startMs, tz);
  const anchorT = cand.anchorMs ? formatTime(cand.anchorMs, tz) : "";
  const type = cand.workoutType ?? "workout";
  const reasonCodes: string[] = [cand.kind];
  let reason = "";
  if (cand.kind === "post_workout") {
    reasonCodes.push(cand.limitedFreeAfter ? "limited_free_time" : "open_window");
    reason = `Your ${type} ends at ${anchorT}. ${t} is the first open window after it that respects your cutoff and calendar${cand.limitedFreeAfter ? ", and the rest of your day looks full" : ""}.`;
  } else if (cand.kind === "pre_workout") {
    reason = `Your ${type} starts at ${anchorT}. ${t} leaves a ${Math.abs(cand.offsetMin)}-minute buffer before it.`;
  } else {
    reasonCodes.push("busy_day");
    reason = `Your day has about ${Math.round(busyHours * 10) / 10} hours of scheduled events. ${t} starts your longest open gap (${cand.gapMinutes} min).`;
  }
  if (cand.kind !== "busy_gap") reasonCodes.push("workout_on_calendar");
  const prefOrder = state.prefs.flavorRank.indexOf(flavor);
  if (prefOrder === 0) reasonCodes.push("top_flavor");
  return {
    id: newId("rec"),
    localDate: date,
    flavor,
    startUtc: isoOf(cand.startMs),
    kind: cand.kind,
    status: "proposed",
    eventRefs: cand.eventRefs,
    anchorUtc: cand.anchorMs ? isoOf(cand.anchorMs) : null,
    reasonCodes,
    reason,
    score,
    scoringVersion: SCORING_VERSION,
    policyVersion: POLICY_VERSION,
    caffeine: resolveCaffeine(state, flavor),
    source: "engine",
    manual: { timeEdited: false, flavorEdited: false },
    conflict: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export { getProduct };
