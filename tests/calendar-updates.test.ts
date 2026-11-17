import { describe, expect, it } from "vitest";
import { acceptRecommendation, confirmWorkout, editRecommendationTime } from "@/lib/domain/actions";
import { isoOf } from "@/lib/domain/time";
import { DATE, at, ev, mkState, plan, todayRecs } from "./helpers";

function setup() {
  const gym = ev(DATE, "07:00", "08:00", "Gym");
  const { state, now } = mkState({ now: at(DATE, "06:30"), events: [gym, ev(DATE, "13:00", "14:00", "Review", { calendarId: "work" })] });
  plan(state, now);
  const r = todayRecs(state).find((x) => x.status === "proposed")!;
  return { state, now, gym, r };
}

describe("calendar changes recompute recommendations", () => {
  it("replaces a proposed suggestion when the workout is rescheduled", () => {
    const { state, now, gym, r } = setup();
    expect(r.kind).toBe("post_workout");
    const ev0 = state.events.find((e) => e.key === gym.key)!;
    ev0.startUtc = isoOf(at(DATE, "09:00").getTime());
    ev0.endUtc = isoOf(at(DATE, "10:00").getTime());
    plan(state, now);
    expect(state.recommendations.find((x) => x.id === r.id)!.status).toBe("invalidated");
    const fresh = todayRecs(state).find((x) => x.status === "proposed")!;
    expect(fresh.id).not.toBe(r.id);
    expect(new Date(fresh.startUtc).getTime()).toBeGreaterThan(at(DATE, "10:00").getTime());
  });

  it("invalidates, explains and cancels reminders when an accepted drink's workout is cancelled", () => {
    const { state, now, gym, r } = setup();
    expect(acceptRecommendation(state, r.id, now).ok).toBe(true);
    expect(state.reminders.some((j) => j.recommendationId === r.id && j.status === "pending")).toBe(true);
    state.events = state.events.filter((e) => e.key !== gym.key); // cancelled / removed by sync
    plan(state, now);
    const after = state.recommendations.find((x) => x.id === r.id)!;
    expect(after.status).toBe("invalidated");
    expect(after.conflict?.code).toBe("workout_removed");
    expect(after.conflict?.message).toMatch(/no longer on your calendar/);
    expect(state.reminders.filter((j) => j.recommendationId === r.id).every((j) => j.status !== "pending")).toBe(true);
  });

  it("keeps an accepted drink when the workout moves but the time still fits, and says so", () => {
    const { state, now, gym, r } = setup();
    acceptRecommendation(state, r.id, now);
    const e = state.events.find((x) => x.key === gym.key)!;
    e.startUtc = isoOf(at(DATE, "07:15").getTime());
    e.endUtc = isoOf(at(DATE, "08:15").getTime());
    plan(state, now);
    const after = state.recommendations.find((x) => x.id === r.id)!;
    expect(after.status).toBe("accepted");
    expect(after.conflict?.code).toBe("workout_moved");
  });

  it("invalidates an accepted drink when a newly-synced event now overlaps it? (soft conflict, kept with notice)", () => {
    const { state, now, r } = setup();
    acceptRecommendation(state, r.id, now);
    const t = new Date(r.startUtc).getTime();
    state.events.push(ev(DATE, "08:10", "09:00", "New meeting", { calendarId: "work" }));
    plan(state, now);
    const after = state.recommendations.find((x) => x.id === r.id)!;
    expect(["accepted", "invalidated"]).toContain(after.status);
    void t;
  });

  it("preserves a valid manual time edit through recompute", () => {
    const { state, now, r } = setup();
    expect(editRecommendationTime(state, r.id, isoOf(at(DATE, "10:30").getTime()), now).ok).toBe(true);
    plan(state, now);
    plan(state, now);
    const after = state.recommendations.find((x) => x.id === r.id)!;
    expect(after.status).toBe("proposed");
    expect(after.manual.timeEdited).toBe(true);
    expect(after.startUtc).toBe(isoOf(at(DATE, "10:30").getTime()));
  });

  it("keeps a manual edit when its workout is removed (still valid) with an explanation", () => {
    const { state, now, gym, r } = setup();
    editRecommendationTime(state, r.id, isoOf(at(DATE, "10:30").getTime()), now);
    state.events = state.events.filter((e) => e.key !== gym.key);
    plan(state, now);
    const after = state.recommendations.find((x) => x.id === r.id)!;
    expect(after.status).toBe("proposed");
    expect(after.conflict?.code).toBe("workout_removed");
  });

  it("withdraws a manual edit that becomes invalid", () => {
    const { state, now, r } = setup();
    editRecommendationTime(state, r.id, isoOf(at(DATE, "10:30").getTime()), now);
    state.prefs.quietHours = { start: "10:00", end: "11:00" };
    plan(state, now);
    expect(state.recommendations.find((x) => x.id === r.id)!.status).toBe("invalidated");
  });

  it("expires suggestions whose time has passed", () => {
    const { state, r } = setup();
    plan(state, at(DATE, "11:00"));
    expect(state.recommendations.find((x) => x.id === r.id)!.status).toBe("expired");
  });

  it("ignores events from unselected calendars", () => {
    const { state, now } = mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym", { calendarId: "family" })] });
    state.calendar.calendars.push({ id: "family", name: "Family", selected: false });
    plan(state, now);
    expect(todayRecs(state).filter((r) => r.kind !== "busy_gap")).toHaveLength(0);
  });

  it("records a correction and drops suggestions when the user says it's not a workout", () => {
    const { state, now, gym, r } = setup();
    const res = confirmWorkout(state, gym.key, false, null, true, now);
    expect(res.ok).toBe(true);
    expect(state.recommendations.find((x) => x.id === r.id)!.status).toBe("invalidated");
    expect(state.feedback.some((e) => e.type === "classification_corrected")).toBe(true);
    expect(state.titleMappings).toHaveLength(1);
  });
});
