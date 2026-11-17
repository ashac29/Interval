import { describe, expect, it } from "vitest";
import { buildScenario, SCENARIOS } from "@/lib/domain/fixtures";
import { deriveLearning } from "@/lib/domain/learning";
import { recordFeedback } from "@/lib/domain/feedback";
import { dismissRecommendation, correctStock } from "@/lib/domain/actions";
import { acceptReplenishment, advanceShipment, delayShipment, pauseSubscription, placeOrder, replenishmentSuggestions, resumeSubscription, skipNextShipment, nextShipment, confirmShipmentDelivered } from "@/lib/domain/commerce";
import { dayBounds, formatTime } from "@/lib/domain/time";
import { dayTally, stockByFlavor } from "@/lib/domain/validate";
import { DATE, at, ev, mkState, plan, rec, todayRecs } from "./helpers";
import { isoOf } from "@/lib/domain/time";

const REAL = new Date("2026-11-17T18:00:00Z");
const todays = (s: Awaited<ReturnType<typeof buildScenario>>) => s.recommendations.filter((r) => r.localDate === s.planRuns[0]!.days[0]!.date);

describe("feedback loop & learning", () => {
  const obs = (state: ReturnType<typeof mkState>["state"], type: Parameters<typeof recordFeedback>[1], data: Record<string, string | number>) => recordFeedback(state, type, data, new Date());

  it("does not overfit to a single action", () => {
    const { state } = mkState();
    obs(state, "rec_rescheduled", { kind: "post_workout", offsetMin: 60 });
    expect(deriveLearning(state).timeBoost("post_workout", 60).value).toBe(0);
  });

  it("adapts mildly after repeated behavior and is capped", () => {
    const { state } = mkState();
    for (let i = 0; i < 10; i++) obs(state, "rec_rescheduled", { kind: "post_workout", offsetMin: 60 });
    const l = deriveLearning(state);
    const boost = l.timeBoost("post_workout", 60).value;
    expect(boost).toBeGreaterThan(3);
    expect(boost).toBeLessThanOrEqual(8);
    expect(l.timeBoost("post_workout", 20).value).toBeLessThan(boost);
  });

  it("ignores undone events (compensating events) and silence", () => {
    const { state } = mkState();
    const ids = Array.from({ length: 5 }, () => obs(state, "rec_accepted", { kind: "post_workout", offsetMin: 45 })!.id);
    expect(deriveLearning(state).timeBoost("post_workout", 45).value).toBeGreaterThan(0);
    for (const id of ids) recordFeedback(state, "rec_acceptance_undone", {}, new Date(), undefined, false, id);
    expect(deriveLearning(state).timeBoost("post_workout", 45).value).toBe(0);
  });

  it("a missed workout never changes timing preferences", () => {
    const { state, now } = mkState();
    for (let i = 0; i < 6; i++) {
      const r = rec(state, { startUtc: isoOf(at(DATE, "09:00").getTime()), kind: "post_workout", anchorUtc: isoOf(at(DATE, "08:40").getTime()) });
      dismissRecommendation(state, r.id, "didnt_work_out", now);
    }
    expect(deriveLearning(state).timeBoost("post_workout", 20)).toEqual({ value: 0, n: 0 });
  });

  it("explicit corrections (reschedule) outweigh passive acceptance", () => {
    const { state } = mkState();
    for (let i = 0; i < 3; i++) obs(state, "rec_accepted", { kind: "post_workout", offsetMin: 20 });
    for (let i = 0; i < 3; i++) obs(state, "rec_rescheduled", { kind: "post_workout", offsetMin: 60 });
    const l = deriveLearning(state);
    expect(l.timeBoost("post_workout", 60).value).toBeGreaterThan(l.timeBoost("post_workout", 20).value);
  });

  it("inferred behavior can't override an explicit timing preference", () => {
    const { state, now } = mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym")] });
    for (let i = 0; i < 20; i++) obs(state, "rec_rescheduled", { kind: "pre_workout", offsetMin: -60 });
    state.prefs.timing = "after";
    plan(state, now);
    expect(todayRecs(state).filter((r) => r.status === "proposed").every((r) => r.kind !== "pre_workout")).toBe(true);
  });

  it("records score reasons and versions on every suggestion", () => {
    const { state, now } = mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym")] });
    plan(state, now);
    const r = todayRecs(state)[0]!;
    expect(r.scoringVersion).toMatch(/^score-/);
    expect(r.policyVersion).toMatch(/^policy-/);
    expect(r.score.parts.length).toBeGreaterThan(2);
    expect(r.score.parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(r.score.total, 0);
  });
});

describe("demo fixtures", () => {
  const get = (id: string) => buildScenario(id, REAL);

  it("every fixture builds with a frozen clock and valid state", async () => {
    for (const sc of SCENARIOS) {
      const s = await get(sc.id);
      expect(s.mode).toBe("demo");
      expect(s.demoNowIso).toBeTruthy();
      expect(s.planRuns[0]).toBeTruthy();
    }
  });
  it("busy morning workout: post-workout suggestion in the open gap on a packed day", async () => {
    const s = await get("busy-morning");
    const r = todays(s).find((x) => x.status === "proposed")!;
    expect(r.kind).toBe("post_workout");
    expect(formatTime(Date.parse(r.startUtc), s.prefs.timezone)).toBe("7:50 AM");
    expect(s.planRuns[0]!.days[0]!.busyHours).toBeGreaterThanOrEqual(4);
  });
  it("quiet workout day suggests a single drink", async () => {
    const s = await get("quiet-workout");
    expect(todays(s).filter((x) => x.status === "proposed")).toHaveLength(1);
  });
  it("busy day without a workout suggests the longest gap", async () => {
    const s = await get("busy-no-workout");
    const r = todays(s).find((x) => x.status === "proposed")!;
    expect(r.kind).toBe("busy_gap");
    expect(formatTime(Date.parse(r.startUtc), s.prefs.timezone)).toBe("12:40 PM");
  });
  it("evening workout past the cutoff yields nothing and says why", async () => {
    const s = await get("evening-cutoff");
    expect(todays(s)).toHaveLength(0);
    expect(s.planRuns[0]!.days[0]!.reasonCodes).toContain("past_cutoff");
  });
  it("ambiguous title requires confirmation", async () => {
    const s = await get("ambiguous-title");
    expect(s.planRuns[0]!.days[0]!.reasonCodes).toContain("workout_needs_confirmation");
    expect(todays(s).every((x) => x.kind === "busy_gap")).toBe(true);
  });
  it("recurring/rescheduled workout: accepted drink re-checked with explanation", async () => {
    const s = await get("recurring-rescheduled");
    const r = todays(s).find((x) => x.status === "accepted")!;
    expect(r.conflict?.code).toBe("workout_moved");
    expect(s.events.filter((e) => e.recurringEventId === "spin-series").length).toBeGreaterThanOrEqual(2);
  });
  it("overlapping calendars merge, all-day/declined/free excluded (5h not 9h+)", async () => {
    const s = await get("overlapping-events");
    expect(s.planRuns[0]!.days[0]!.busyHours).toBe(5);
  });
  it("no eligible slots: zero suggestions is a valid answer", async () => {
    const s = await get("no-slots");
    expect(todays(s)).toHaveLength(0);
    expect(s.planRuns[0]!.days[0]!.reasonCodes).toContain("no_eligible_slot");
  });
  it("unknown caffeine blocks all suggestions", async () => {
    const s = await get("unknown-caffeine");
    expect(s.recommendations.filter((r) => r.status === "proposed")).toHaveLength(0);
    expect(s.planRuns[0]!.days[0]!.reasonCodes).toContain("unknown_caffeine");
  });
  it("two drinks already logged: at the cap, tracked caffeine includes external", async () => {
    const s = await get("two-drinks");
    const t = dayTally(s, s.planRuns[0]!.days[0]!.date);
    expect(t.capReached).toBe(true);
    expect(t.trackedMg).toBe(40 + 30 + 95);
    expect(todays(s).filter((x) => x.status === "proposed")).toHaveLength(0);
  });
  it("insufficient inventory limits flavor and drives replenishment suggestions", async () => {
    const s = await get("low-inventory");
    const r = todays(s).find((x) => x.status === "proposed")!;
    expect(r.flavor).toBe("oolong");
    expect(stockByFlavor(s)).toEqual({ chai: 0, oolong: 1, matcha: 0 });
    const sug = replenishmentSuggestions(s, new Date(s.demoNowIso!));
    expect(sug[0]?.kind).toBe("advance");
  });
  it("DST boundary week: spring-forward day has 23 hours and suggestions land at correct local times", async () => {
    const s = await get("dst-boundary");
    const b = dayBounds("2027-03-14", s.prefs.timezone);
    expect((b.endMs - b.startMs) / 3_600_000).toBe(23);
    const sun = s.recommendations.find((r) => r.localDate === "2027-03-14")!;
    expect(formatTime(Date.parse(sun.startUtc), s.prefs.timezone)).toBe("8:20 AM");
  });
});

describe("simulated commerce", () => {
  const sub = async () => buildScenario("busy-morning", REAL);

  it("never modifies shipments silently; advance/delay/skip are explicit", async () => {
    const s = await sub();
    const now = new Date(s.demoNowIso!);
    const before = JSON.stringify(s.subscription.shipments);
    plan(s, now);
    expect(JSON.stringify(s.subscription.shipments)).toBe(before);
    const nextDate = nextShipment(s)!.date;
    expect(delayShipment(s, 14, now).ok).toBe(true);
    expect(nextShipment(s)!.date > nextDate).toBe(true);
    expect(delayShipment(s, 5, now).ok).toBe(false);
    expect(advanceShipment(s, "2020-01-01", now).ok).toBe(false);
    expect(skipNextShipment(s, now).ok).toBe(true);
    expect(s.subscription.shipments.filter((x) => x.status === "scheduled")).toHaveLength(1);
  });
  it("pause/resume and delivery confirmation update logged stock", async () => {
    const s = await sub();
    const now = new Date(s.demoNowIso!);
    expect(pauseSubscription(s, now).ok).toBe(true);
    expect(nextShipment(s)).toBeNull();
    expect(resumeSubscription(s, null, now).ok).toBe(true);
    const ship = nextShipment(s)!;
    const before = Object.values(stockByFlavor(s)).reduce((a, b) => a + b, 0);
    expect(confirmShipmentDelivered(s, ship.id, now).ok).toBe(true);
    expect(Object.values(stockByFlavor(s)).reduce((a, b) => a + b, 0)).toBe(before + 24);
    expect(confirmShipmentDelivered(s, ship.id, now).ok).toBe(true);
    expect(Object.values(stockByFlavor(s)).reduce((a, b) => a + b, 0)).toBe(before + 24); // idempotent
  });
  it("replenishment requires confirmation and records the decision", async () => {
    const s = await buildScenario("low-inventory", REAL);
    const now = new Date(s.demoNowIso!);
    const sug = replenishmentSuggestions(s, now)[0]!;
    const shipDate = nextShipment(s)!.date;
    expect(nextShipment(s)!.date).toBe(shipDate); // suggestion alone changes nothing
    expect(acceptReplenishment(s, sug.id, now).ok).toBe(true);
    expect(nextShipment(s)!.date < shipDate).toBe(true);
    expect(s.feedback.some((e) => e.type === "replenishment_accepted")).toBe(true);
    expect(acceptReplenishment(s, "advance:1999-01-01", now).ok).toBe(false);
  });
  it("manual stock correction is logged and bounded", async () => {
    const s = await sub();
    const now = new Date(s.demoNowIso!);
    expect(correctStock(s, "chai", 3, now).ok).toBe(true);
    expect(stockByFlavor(s).chai).toBe(3);
    expect(correctStock(s, "chai", -1, now).ok).toBe(false);
    expect(s.feedback.some((e) => e.type === "inventory_corrected")).toBe(true);
  });
  it("checkout validates the mix, is simulated, and blocks a second subscription", async () => {
    const s = mkState().state;
    const now = new Date();
    expect(placeOrder(s, { offer: "trial", mix: { chai: 4, oolong: 4, matcha: 3 }, name: "A", city: "B" }, now).ok).toBe(false);
    const ok = placeOrder(s, { offer: "subscription", mix: { chai: 8, oolong: 8, matcha: 8 }, name: "A", city: "B" }, now);
    expect(ok.ok).toBe(true);
    expect(s.orders[0]!.simulated).toBe(true);
    expect(s.subscription.status).toBe("active");
    expect(placeOrder(s, { offer: "subscription", mix: { chai: 8, oolong: 8, matcha: 8 }, name: "A", city: "B" }, now).ok).toBe(false);
  });
});
