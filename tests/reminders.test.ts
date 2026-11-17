import { describe, expect, it } from "vitest";
import { acceptRecommendation, dismissRecommendation, editRecommendationTime } from "@/lib/domain/actions";
import { processDueJobs, syncReminders } from "@/lib/domain/reminders";
import { previewEmailAdapter, type EmailAdapter } from "@/lib/adapters/email";
import { isoOf } from "@/lib/domain/time";
import { DATE, at, ev, mkState, plan, todayRecs } from "./helpers";

function setup(email = false) {
  const { state, now } = mkState({ now: at(DATE, "06:30"), events: [ev(DATE, "07:00", "08:00", "Gym")] });
  if (email) {
    state.prefs.reminders.email = true;
    state.prefs.reminders.emailAddress = "x@example.com";
  }
  plan(state, now);
  const r = todayRecs(state).find((x) => x.status === "proposed")!;
  acceptRecommendation(state, r.id, now);
  return { state, now, r };
}
const sender = (impl: EmailAdapter["send"]): EmailAdapter => ({ id: "fake", configured: true, send: impl });

describe("reminders", () => {
  it("schedules exactly one job per channel and never duplicates on re-sync", () => {
    const { state, now } = setup(true);
    syncReminders(state, now);
    syncReminders(state, now);
    expect(state.reminders.filter((j) => j.status === "pending")).toHaveLength(2);
    expect(new Set(state.reminders.map((j) => j.dedupeKey)).size).toBe(state.reminders.length);
  });

  it("sends in-app once and dedupes repeated processing", async () => {
    const { state, r } = setup();
    const when = new Date(Date.parse(r.startUtc) - 5 * 60_000);
    const a = await processDueJobs(state, when, previewEmailAdapter);
    const b = await processDueJobs(state, when, previewEmailAdapter);
    expect(a.sent).toBe(1);
    expect(b.processed).toBe(0);
    expect(state.notices).toHaveLength(1);
  });

  it("cancels stale jobs on reschedule and revalidates status before sending", async () => {
    const { state, now, r } = setup();
    const first = state.reminders[0]!;
    editRecommendationTime(state, r.id, isoOf(at(DATE, "10:30").getTime()), now);
    expect(state.reminders.find((j) => j.id === first.id)!.status).toBe("cancelled");
    expect(state.reminders.find((j) => j.id === first.id)!.cancelReason).toBe("rescheduled");
    expect(state.reminders.filter((j) => j.status === "pending")).toHaveLength(1);
    // Dismiss, then force a pending job through the processor: it must not send.
    dismissRecommendation(state, r.id, "wrong_time", now);
    expect(state.reminders.every((j) => j.status !== "pending")).toBe(true);
    state.reminders.push({ ...first, id: "ghost", status: "pending", runAt: isoOf(now.getTime()) });
    const res = await processDueJobs(state, at(DATE, "10:20"), previewEmailAdapter);
    expect(res.cancelled).toBe(1);
    expect(state.notices).toHaveLength(0);
  });

  it("defers during quiet hours and skips if the drink time would pass", async () => {
    const { state, r } = setup();
    state.prefs.quietHours = { start: "07:00", end: "08:30" };
    const job = state.reminders[0]!;
    job.runAt = isoOf(at(DATE, "08:00").getTime());
    const res = await processDueJobs(state, at(DATE, "08:00"), previewEmailAdapter);
    // drink at ~08:20 is before quiet end 08:30 -> skipped, not sent
    expect(res.skipped + res.deferred).toBe(1);
    expect(state.notices).toHaveLength(0);
    void r;
  });

  it("unconfigured email yields a PREVIEW, never a false 'sent'", async () => {
    const { state, r } = setup(true);
    const when = new Date(Date.parse(r.startUtc) - 5 * 60_000);
    const res = await processDueJobs(state, when, previewEmailAdapter);
    expect(res.previewed).toBe(1);
    expect(state.emailPreviews.every((p) => p.status === "previewed")).toBe(true);
    expect(state.reminders.find((j) => j.channel === "email")!.status).toBe("previewed");
  });

  it("retries transient provider failures with backoff, then succeeds", async () => {
    const { state, r } = setup(true);
    let calls = 0;
    const flaky = sender(async () => (++calls < 3 ? { ok: false, transient: true, error: "503" } : { ok: true }));
    let t = new Date(Date.parse(r.startUtc) - 40 * 60_000);
    state.reminders.find((j) => j.channel === "email")!.runAt = t.toISOString();
    for (let i = 0; i < 4; i++) {
      await processDueJobs(state, t, flaky);
      t = new Date(t.getTime() + 6 * 60_000);
    }
    const job = state.reminders.find((j) => j.channel === "email")!;
    expect(calls).toBe(3);
    expect(job.status).toBe("sent");
    expect(state.emailPreviews.filter((p) => p.status === "sent")).toHaveLength(1);
  });

  it("fails permanently after max attempts and doesn't loop", async () => {
    const { state, r } = setup(true);
    const dead = sender(async () => ({ ok: false, transient: true, error: "down" }));
    let t = new Date(Date.parse(r.startUtc) - 60 * 60_000);
    state.reminders.find((j) => j.channel === "email")!.runAt = t.toISOString();
    let calls = 0;
    const counting = sender(async () => {
      calls++;
      return { ok: false, transient: true, error: "down" };
    });
    for (let i = 0; i < 8; i++) {
      await processDueJobs(state, t, counting);
      t = new Date(t.getTime() + 6 * 60_000);
    }
    void dead;
    expect(state.reminders.find((j) => j.channel === "email")!.status).toBe("failed");
    expect(calls).toBe(4);
  });

  it("cancels email jobs when the user opts out", async () => {
    const { state, r } = setup(true);
    state.prefs.reminders.email = false;
    syncReminders(state, at(DATE, "06:31"));
    expect(state.reminders.filter((j) => j.channel === "email").every((j) => j.status === "cancelled")).toBe(true);
    void r;
  });
});
