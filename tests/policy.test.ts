import { describe, expect, it } from "vitest";
import { acceptRecommendation, completeRecommendation, editRecommendationTime, logDrink, logExternalCaffeine, undoConsumption, setPlanningTimezone } from "@/lib/domain/actions";
import { dayTally, drinkCap, validateCandidate } from "@/lib/domain/validate";
import { updatePreferences } from "@/lib/domain/prefs";
import { MemoryStateStore } from "@/lib/store/memory";
import { DATE, at, ev, mkState, plan, rec, todayRecs } from "./helpers";
import { isoOf } from "@/lib/domain/time";
import { caffeineLabel, resolveCaffeine } from "@/lib/domain/catalog";

const workoutDay = () => mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym")] });

describe("daily cap", () => {
  it("never proposes more than the cap, and zero is valid", () => {
    const { state, now } = mkState({ events: [ev(DATE, "07:00", "08:00", "Gym"), ev(DATE, "17:00", "18:00", "Spin class")], now: at(DATE, "06:00") });
    state.prefs.maxDrinksPerDay = 1;
    plan(state, now);
    expect(todayRecs(state).filter((r) => r.status === "proposed").length).toBeLessThanOrEqual(1);
    state.prefs.maxDrinksPerDay = 2;
    plan(state, now);
    expect(todayRecs(state).filter((r) => r.status === "proposed").length).toBeLessThanOrEqual(2);
    expect(drinkCap(state)).toBe(2);
  });

  it("can't be raised above the policy cap", () => {
    const { state, now } = mkState();
    expect(updatePreferences(state, { maxDrinksPerDay: 3 }, now).ok).toBe(false);
    expect(updatePreferences(state, { maxDrinksPerDay: 1 }, now).ok).toBe(true);
  });

  it("rejects an acceptance that would exceed the cap (completed + accepted count)", () => {
    const { state, now } = mkState();
    const a = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()) });
    const b = rec(state, { startUtc: isoOf(at(DATE, "11:30").getTime()) });
    const c = rec(state, { startUtc: isoOf(at(DATE, "13:30").getTime()) });
    expect(acceptRecommendation(state, a.id, now).ok).toBe(true);
    logDrink(state, "oolong", "k1", now); // truthful logging counts too
    const r = acceptRecommendation(state, b.id, now);
    expect(r.ok).toBe(false);
    // The planner withdraws over-cap proposals as soon as the drink is logged; acceptance is refused either way.
    const bAfter = state.recommendations.find((x) => x.id === b.id)!;
    expect(bAfter.status === "invalidated" ? bAfter.conflict?.code : r.ok === false && r.violations?.[0]?.code).toBe("daily_cap");
    expect(acceptRecommendation(state, c.id, now).ok).toBe(false);
  });

  it("allows truthful logging past the cap but then stops suggestions", () => {
    const { state, now } = workoutDay();
    plan(state, now);
    logDrink(state, "chai", "a", now);
    logDrink(state, "oolong", "b", now);
    const third = logDrink(state, "matcha", "c", now);
    expect(third.ok).toBe(true);
    expect(state.consumption.filter((c) => !c.voidedAt)).toHaveLength(3);
    expect(todayRecs(state).filter((r) => r.status === "proposed" || r.status === "accepted")).toHaveLength(0);
    expect(state.planRuns[0]!.days[0]!.reasonCodes).toContain("cap_reached");
  });

  it("concurrent acceptances cannot both pass the cap (serialized store)", async () => {
    const { state, now } = mkState();
    state.prefs.maxDrinksPerDay = 1;
    const a = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()) });
    const b = rec(state, { startUtc: isoOf(at(DATE, "12:00").getTime()) });
    const store = new MemoryStateStore();
    await store.create("u1", state);
    const results = await Promise.all([a.id, b.id, a.id, b.id].map((id) => store.mutate("u1", (s) => acceptRecommendation(s, id, now))));
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
    const final = (await store.get("u1"))!;
    expect(final.recommendations.filter((r) => r.status === "accepted")).toHaveLength(1);
  });
});

describe("caffeine", () => {
  it("tracks consumed + external + accepted-future, and labels it tracked", () => {
    const { state, now } = mkState();
    logExternalCaffeine(state, "Coffee", 95, now);
    const r = rec(state, { startUtc: isoOf(at(DATE, "12:00").getTime()), flavor: "matcha", caffeine: { mg: 35, status: "illustrative" } });
    acceptRecommendation(state, r.id, now);
    logDrink(state, "chai", "c1", now);
    const t = dayTally(state, DATE);
    expect(t.externalMg).toBe(95);
    expect(t.plannedMg).toBe(35);
    expect(t.consumedMg).toBe(40);
    expect(t.trackedMg).toBe(170);
  });

  it("planned -> consumed is not double counted", () => {
    const { state, now } = mkState();
    const r = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()), flavor: "chai" });
    acceptRecommendation(state, r.id, now);
    expect(dayTally(state, DATE).trackedMg).toBe(40);
    const done = completeRecommendation(state, r.id, "key-1", now);
    expect(done.ok).toBe(true);
    const t = dayTally(state, DATE);
    expect(t.plannedMg).toBe(0);
    expect(t.consumedMg).toBe(40);
    expect(t.trackedMg).toBe(40);
    expect(t.counted).toBe(1);
  });

  it("unknown caffeine is not zero and cannot pass validation", () => {
    const { state, now } = mkState();
    state.caffeineOverrides = { chai: { mg: null, status: "unknown" } };
    const v = validateCandidate(state, { flavor: "chai", startUtc: isoOf(at(DATE, "09:00").getTime()) }, { mode: "propose", now });
    expect(v.ok).toBe(false);
    expect(v.violations.map((x) => x.code)).toContain("unknown_caffeine");
    expect(caffeineLabel(resolveCaffeine(state, "chai"))).toMatch(/not established/);
  });

  it("an unknown external entry makes the day unverifiable (not zero)", () => {
    const { state, now } = mkState();
    logExternalCaffeine(state, "Mystery tea", null, now);
    const t = dayTally(state, DATE);
    expect(t.hasUnknown).toBe(true);
    expect(t.trackedMg).toBe(0);
    const v = validateCandidate(state, { flavor: "chai", startUtc: isoOf(at(DATE, "09:00").getTime()) }, { mode: "propose", now });
    expect(v.violations.map((x) => x.code)).toContain("unknown_caffeine_day");
  });

  it("enforces a lower personal ceiling but not a higher one", () => {
    const { state, now } = mkState();
    expect(updatePreferences(state, { caffeineCeilingMg: 500 }, now).ok).toBe(false);
    expect(updatePreferences(state, { caffeineCeilingMg: 100 }, now).ok).toBe(true);
    logExternalCaffeine(state, "Coffee", 95, now);
    const v = validateCandidate(state, { flavor: "chai", startUtc: isoOf(at(DATE, "09:00").getTime()) }, { mode: "propose", now });
    expect(v.violations.map((x) => x.code)).toContain("caffeine_ceiling");
  });

  it("demo values are labeled illustrative; live defaults are unknown", () => {
    const demo = mkState().state;
    expect(resolveCaffeine(demo, "matcha").status).toBe("illustrative");
    expect(caffeineLabel(resolveCaffeine(demo, "matcha"))).toContain("illustrative");
    const live = mkState({ mode: "live" }).state;
    expect(resolveCaffeine(live, "matcha")).toEqual({ mg: null, status: "unknown" });
  });
});

describe("consumption idempotency & undo", () => {
  it("same key twice logs once and decrements stock once", () => {
    const { state, now } = mkState({ stock: { chai: 3 } });
    expect(logDrink(state, "chai", "dup", now).ok).toBe(true);
    expect(logDrink(state, "chai", "dup", now).ok).toBe(true);
    expect(state.consumption).toHaveLength(1);
    expect(state.inventory.filter((t) => t.reason === "consumption")).toHaveLength(1);
  });

  it("undo restores stock, count and recommendation, and is itself idempotent", () => {
    const { state, now } = mkState({ stock: { chai: 3 } });
    const r = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()), status: "accepted" });
    const res = completeRecommendation(state, r.id, "k", now);
    expect(res.ok && res.consumptionId).toBeTruthy();
    const id = state.consumption[0]!.id;
    expect(undoConsumption(state, id, now).ok).toBe(true);
    expect(undoConsumption(state, id, now).ok).toBe(true);
    expect(dayTally(state, DATE).counted).toBeGreaterThanOrEqual(0);
    expect(state.inventory.reduce((s, t) => s + (t.flavor === "chai" ? t.delta : 0), 0)).toBe(3);
    expect(state.recommendations.find((x) => x.id === r.id)!.status).toBe("accepted");
    // append-only: undo is a compensating event
    const undone = state.feedback.find((e) => e.type === "consumption_undone")!;
    expect(undone.compensates).toBeTruthy();
    expect(state.feedback.find((e) => e.id === undone.compensates)).toBeTruthy();
  });

  it("undoing 'Had one' on a merely proposed suggestion restores it to proposed (never silently accepts)", () => {
    const { state, now } = mkState();
    const r = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()) });
    completeRecommendation(state, r.id, "p1", now);
    undoConsumption(state, state.consumption[0]!.id, now);
    expect(state.recommendations.find((x) => x.id === r.id)!.status).toBe("proposed");
    expect(dayTally(state, DATE).counted).toBe(0);
  });

  it("logging with zero logged stock doesn't push stock negative", () => {
    const { state, now } = mkState({ stock: { chai: 0 } });
    const r = logDrink(state, "chai", "z", now);
    expect(r.ok && r.message).toMatch(/stock/i);
    expect(state.inventory.reduce((s, t) => s + (t.flavor === "chai" ? t.delta : 0), 0)).toBe(0);
  });
});

describe("planning day boundaries & timezone", () => {
  it("assigns a 23:30 local log to that planning day, not the next", () => {
    const { state } = mkState();
    const late = at(DATE, "23:30");
    logDrink(state, "chai", "late", late);
    expect(dayTally(state, DATE).completed).toBe(1);
    expect(dayTally(state, "2026-11-18").completed).toBe(0);
  });

  it("changing the device timezone doesn't change the planning day; changing the planning timezone is explicit", () => {
    const { state, now } = mkState();
    const late = at(DATE, "23:30");
    logDrink(state, "chai", "late", late);
    // A different "device" timezone is irrelevant: only prefs.timezone is used.
    expect(dayTally(state, DATE).completed).toBe(1);
    const res = setPlanningTimezone(state, "Asia/Tokyo", now);
    expect(res.ok).toBe(true);
    expect(dayTally(state, "2026-11-18").completed).toBe(1); // re-bucketed only because the user explicitly switched
    expect(state.prefs.provenance.timezone).toBe("explicit");
  });

  it("respects the caffeine cutoff and quiet hours", () => {
    const { state, now } = mkState();
    const late = validateCandidate(state, { flavor: "chai", startUtc: isoOf(at(DATE, "16:00").getTime()) }, { mode: "propose", now });
    expect(late.violations.map((v) => v.code)).toContain("past_cutoff");
    const quiet = validateCandidate(state, { flavor: "chai", startUtc: isoOf(at(DATE, "22:30").getTime()) }, { mode: "propose", now });
    expect(quiet.violations.map((v) => v.code)).toContain("quiet_hours");
  });
});

describe("dietary & inventory", () => {
  it("blocks suggestions for milk-conflicting restrictions and never claims compatibility", () => {
    const { state, now } = workoutDay();
    state.prefs.dietary = ["dairy-free"];
    plan(state, now);
    expect(todayRecs(state).filter((r) => r.status === "proposed")).toHaveLength(0);
    expect(state.planRuns[0]!.days[0]!.reasonCodes).toContain("dietary");
  });
  it("other restrictions are blocked while ingredient data is unverified", () => {
    const { state, now } = workoutDay();
    state.prefs.dietary = ["gluten-free"];
    plan(state, now);
    const msgs = state.planRuns[0]!.days[0]!.messages.join(" ");
    expect(msgs).toMatch(/verified|check the can label/i);
    expect(msgs).not.toMatch(/compatible with/i);
  });
  it("doesn't suggest flavors with no stock; suggests no drink when everything is out", () => {
    const { state, now } = mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym")], stock: { chai: 0, oolong: 1, matcha: 0 } });
    plan(state, now);
    const r = todayRecs(state).find((x) => x.status === "proposed")!;
    expect(r.flavor).toBe("oolong");
    const none = mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym")], stock: { chai: 0, oolong: 0, matcha: 0 } });
    plan(none.state, none.now);
    expect(todayRecs(none.state).filter((x) => x.status === "proposed")).toHaveLength(0);
    expect(none.state.planRuns[0]!.days[0]!.reasonCodes).toContain("no_inventory");
  });
  it("editing a time re-validates against policy", () => {
    const { state, now } = mkState();
    const r = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()) });
    expect(editRecommendationTime(state, r.id, isoOf(at(DATE, "16:30").getTime()), now).ok).toBe(false);
    expect(editRecommendationTime(state, r.id, isoOf(at(DATE, "10:00").getTime()), now).ok).toBe(true);
  });
});
