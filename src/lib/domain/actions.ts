import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { FLAVORS, type Flavor } from "@/config/products";
import { resolveCaffeine } from "./catalog";
import { normalizeTitle } from "./classify";
import { recompute } from "./engine";
import { recordFeedback } from "./feedback";
import { newId } from "./ids";
import { cancelRemindersFor, syncReminders } from "./reminders";
import { isValidTimezone, isoOf, localDateOf, localMinutesOf } from "./time";
import { dateOf, stockByFlavor, validateCandidate, type Violation } from "./validate";
import type { AppState, DismissReason, Recommendation } from "./types";
import { DISMISS_REASONS } from "./types";

export type ActionResult<T extends object = object> = ({ ok: true; message: string } & T) | { ok: false; error: string; violations?: Violation[] };

const ok = (message: string): { ok: true; message: string } => ({ ok: true, message });
const fail = (error: string, violations?: Violation[]): { ok: false; error: string; violations?: Violation[] } => ({ ok: false, error, ...(violations ? { violations } : {}) });

const find = (state: AppState, id: string) => state.recommendations.find((r) => r.id === id);

function offsetFor(state: AppState, rec: Pick<Recommendation, "kind" | "anchorUtc">, startMs: number): number {
  if (rec.kind === "busy_gap" || !rec.anchorUtc) return localMinutesOf(startMs, state.prefs.timezone);
  const anchor = Date.parse(rec.anchorUtc);
  return Math.round((startMs - anchor) / 60_000);
}

function lastEventId(state: AppState, type: string, recId: string): string | undefined {
  const compensated = new Set(state.feedback.filter((e) => e.compensates).map((e) => e.compensates));
  for (let i = state.feedback.length - 1; i >= 0; i--) {
    const e = state.feedback[i]!;
    if (e.type === type && e.recId === recId && !compensated.has(e.id)) return e.id;
  }
  return undefined;
}

/* ───────────── Exposure ───────────── */

/** Record that suggestions were actually shown to the user. Once per suggestion. */
export function recordExposure(state: AppState, recIds: string[], now: Date): ActionResult {
  const seen = new Set(state.feedback.filter((e) => e.type === "rec_exposed").map((e) => e.recId));
  for (const id of recIds.slice(0, 20)) {
    const r = find(state, id);
    if (!r || r.status !== "proposed" || seen.has(id)) continue;
    recordFeedback(state, "rec_exposed", { kind: r.kind, flavor: r.flavor }, now, id);
  }
  return ok("recorded");
}

/* ───────────── Recommendation lifecycle ───────────── */

export function acceptRecommendation(state: AppState, recId: string, now: Date, cfg: PolicyConfig = defaultPolicy): ActionResult {
  const r = find(state, recId);
  if (!r) return fail("That suggestion no longer exists.");
  if (r.status === "accepted") return ok("Already accepted.");
  if (r.status !== "proposed") return fail(`This suggestion is ${r.status} and can’t be accepted.`);
  const v = validateCandidate(state, { id: r.id, flavor: r.flavor, startUtc: r.startUtc }, { mode: "accept", now, cfg });
  if (!v.ok) return fail(v.violations[0]!.message, v.violations);
  r.status = "accepted";
  r.acceptedAt = now.toISOString();
  r.updatedAt = now.toISOString();
  r.conflict = null;
  recordFeedback(state, "rec_accepted", { kind: r.kind, flavor: r.flavor, offsetMin: offsetFor(state, r, Date.parse(r.startUtc)) }, now, r.id);
  recompute(state, now, { trigger: "accept", cfg });
  return ok("Added to your plan. We’ll remind you before it’s time.");
}

export function undoAcceptance(state: AppState, recId: string, now: Date): ActionResult {
  const r = find(state, recId);
  if (!r || r.status !== "accepted") return fail("Only an accepted suggestion can be moved back.");
  r.status = "proposed";
  r.acceptedAt = undefined;
  r.updatedAt = now.toISOString();
  cancelRemindersFor(state, r.id, "acceptance_undone", now);
  recordFeedback(state, "rec_acceptance_undone", { kind: r.kind }, now, r.id, false, lastEventId(state, "rec_accepted", r.id));
  recompute(state, now, { trigger: "undo_accept" });
  return ok("Moved back to suggestions.");
}

export function dismissRecommendation(state: AppState, recId: string, reason: DismissReason, now: Date): ActionResult<{ hint?: string }> {
  if (!DISMISS_REASONS.some((d) => d.id === reason)) return fail("Choose a reason.");
  const r = find(state, recId);
  if (!r || (r.status !== "proposed" && r.status !== "accepted")) return fail("This suggestion can’t be dismissed.");
  r.status = "dismissed";
  r.dismissedReason = reason;
  r.updatedAt = now.toISOString();
  cancelRemindersFor(state, r.id, "dismissed", now);
  recordFeedback(
    state,
    "rec_dismissed",
    { reason, kind: r.kind, flavor: r.flavor, offsetMin: offsetFor(state, r, Date.parse(r.startUtc)) },
    now,
    r.id,
  );
  recompute(state, now, { trigger: "dismiss" });
  const hint =
    reason === "too_many_reminders"
      ? "You can change reminder settings in Account, or tell us in plain words under “Adjust my week”."
      : reason === "didnt_work_out"
        ? "No problem — a skipped workout won’t change your timing preferences."
        : undefined;
  return { ...ok("Dismissed. We’ll use that to improve."), ...(hint ? { hint } : {}) };
}

function addConsumption(state: AppState, flavor: Flavor, key: string, recId: string | null, now: Date): { id: string; stockNote: string | null } {
  const id = newId("con");
  state.consumption.push({
    id,
    flavor,
    at: now.toISOString(),
    localDate: localDateOf(now.getTime(), state.prefs.timezone),
    caffeine: resolveCaffeine(state, flavor),
    recommendationId: recId,
    idempotencyKey: key,
    voidedAt: null,
  });
  let stockNote: string | null = null;
  if (stockByFlavor(state)[flavor] > 0) {
    state.inventory.push({ id: newId("inv"), flavor, delta: -1, reason: "consumption", basis: "logged", at: now.toISOString(), ref: id });
  } else {
    stockNote = `Your logged ${flavor} stock was already 0, so the stock count wasn’t changed. Correct it in Supply if needed.`;
  }
  return { id, stockNote };
}

/** "Had one": idempotent by key. Truthful logging is allowed beyond the cap; it only stops further suggestions. */
export function completeRecommendation(state: AppState, recId: string, key: string, now: Date): ActionResult<{ consumptionId: string }> {
  const existing = state.consumption.find((c) => c.idempotencyKey === key);
  if (existing) return { ...ok("Already logged."), consumptionId: existing.id };
  const r = find(state, recId);
  if (!r) return fail("That suggestion no longer exists.");
  if (!["proposed", "accepted", "expired"].includes(r.status)) return fail(`This suggestion is ${r.status} and can’t be logged.`);
  const { id, stockNote } = addConsumption(state, r.flavor, key, r.id, now);
  r.priorStatus = r.status as "proposed" | "accepted" | "expired";
  r.status = "completed";
  r.completedAt = now.toISOString();
  r.consumptionId = id;
  r.updatedAt = now.toISOString();
  cancelRemindersFor(state, r.id, "completed", now);
  recordFeedback(state, "consumption_logged", { flavor: r.flavor, viaRecommendation: true }, now, r.id);
  recordFeedback(state, "rec_completed", { kind: r.kind, flavor: r.flavor, offsetMin: offsetFor(state, r, now.getTime()) }, now, r.id);
  recompute(state, now, { trigger: "consume" });
  return { ...ok(stockNote ? `Logged. ${stockNote}` : "Logged. Enjoy it."), consumptionId: id };
}

/** Log a drink that wasn't a suggestion. */
export function logDrink(state: AppState, flavor: Flavor, key: string, now: Date): ActionResult<{ consumptionId: string }> {
  const existing = state.consumption.find((c) => c.idempotencyKey === key);
  if (existing) return { ...ok("Already logged."), consumptionId: existing.id };
  if (!FLAVORS.includes(flavor)) return fail("Choose a flavor.");
  const { id, stockNote } = addConsumption(state, flavor, key, null, now);
  recordFeedback(state, "consumption_logged", { flavor, viaRecommendation: false }, now);
  recompute(state, now, { trigger: "consume_adhoc" });
  return { ...ok(stockNote ? `Logged. ${stockNote}` : "Logged."), consumptionId: id };
}

export function undoConsumption(state: AppState, consumptionId: string, now: Date): ActionResult {
  const c = state.consumption.find((x) => x.id === consumptionId);
  if (!c) return fail("That log entry doesn’t exist.");
  if (c.voidedAt) return ok("Already undone.");
  c.voidedAt = now.toISOString();
  const tx = state.inventory.find((t) => t.ref === c.id && t.reason === "consumption");
  if (tx) state.inventory.push({ id: newId("inv"), flavor: c.flavor, delta: 1, reason: "consumption_undo", basis: "logged", at: now.toISOString(), ref: c.id });
  const rec = c.recommendationId ? find(state, c.recommendationId) : undefined;
  if (rec && rec.status === "completed") {
    const expired = Date.parse(rec.startUtc) + defaultPolicy.timing.expireGraceMinutes * 60_000 < now.getTime();
    rec.status = expired ? "expired" : (rec.priorStatus === "expired" ? "expired" : (rec.priorStatus ?? "accepted"));
    rec.priorStatus = undefined;
    rec.consumptionId = undefined;
    rec.completedAt = undefined;
    rec.updatedAt = now.toISOString();
    recordFeedback(state, "consumption_undone", { flavor: c.flavor }, now, rec.id, false, lastEventId(state, "rec_completed", rec.id));
  } else {
    recordFeedback(state, "consumption_undone", { flavor: c.flavor }, now, undefined, false);
  }
  recompute(state, now, { trigger: "undo_consume" });
  return ok("Undone. Your count and stock are restored.");
}

export function editRecommendationTime(state: AppState, recId: string, newStartUtc: string, now: Date, cfg: PolicyConfig = defaultPolicy): ActionResult {
  const r = find(state, recId);
  if (!r || (r.status !== "proposed" && r.status !== "accepted")) return fail("Only an open suggestion can be rescheduled.");
  const v = validateCandidate(state, { id: r.id, flavor: r.flavor, startUtc: newStartUtc }, { mode: "edit", now, cfg });
  if (!v.ok) return fail(v.violations[0]!.message, v.violations);
  const from = offsetFor(state, r, Date.parse(r.startUtc));
  r.startUtc = isoOf(Date.parse(newStartUtc));
  r.localDate = dateOf(state, r.startUtc);
  r.manual.timeEdited = true;
  r.source = "manual";
  r.conflict = null;
  r.updatedAt = now.toISOString();
  const to = offsetFor(state, r, Date.parse(r.startUtc));
  recordFeedback(state, "rec_rescheduled", { kind: r.kind, offsetMin: to, fromOffsetMin: from, flavor: r.flavor }, now, r.id);
  recordFeedback(state, "weekly_plan_edited", { edit: "time" }, now, r.id);
  syncReminders(state, now, cfg);
  recompute(state, now, { trigger: "edit_time", cfg });
  return ok(v.warnings.length ? `Rescheduled. Note: ${v.warnings[0]}` : "Rescheduled.");
}

export function changeRecommendationFlavor(state: AppState, recId: string, flavor: Flavor, now: Date, cfg: PolicyConfig = defaultPolicy): ActionResult {
  const r = find(state, recId);
  if (!r || (r.status !== "proposed" && r.status !== "accepted")) return fail("Only an open suggestion can change flavor.");
  if (r.flavor === flavor) return ok("Flavor unchanged.");
  const v = validateCandidate(state, { id: r.id, flavor, startUtc: r.startUtc }, { mode: "edit", now, cfg });
  const hard = v.violations.filter((x) => x.code !== "in_past");
  if (hard.length) return fail(hard[0]!.message, hard);
  const from = r.flavor;
  r.flavor = flavor;
  r.caffeine = resolveCaffeine(state, flavor);
  r.manual.flavorEdited = true;
  r.source = "manual";
  r.updatedAt = now.toISOString();
  recordFeedback(state, "rec_flavor_changed", { from, to: flavor, kind: r.kind }, now, r.id);
  recordFeedback(state, "weekly_plan_edited", { edit: "flavor" }, now, r.id);
  recompute(state, now, { trigger: "edit_flavor", cfg });
  return ok(`Switched to ${flavor}.`);
}

export function acknowledgeConflict(state: AppState, recId: string, now: Date): ActionResult {
  const r = find(state, recId);
  if (!r) return fail("That suggestion no longer exists.");
  r.conflict = null;
  r.updatedAt = now.toISOString();
  return ok("Got it.");
}

/* ───────────── Workout confirmation ───────────── */

export function confirmWorkout(
  state: AppState,
  eventKey: string,
  isWorkout: boolean,
  workoutType: string | null,
  remember: boolean,
  now: Date,
): ActionResult {
  const ev = state.events.find((e) => e.key === eventKey);
  if (!ev) return fail("That event is no longer on your calendar.");
  const type = isWorkout ? (workoutType && workoutType.trim() ? workoutType.trim().slice(0, 30) : "workout") : null;
  state.eventOverrides[eventKey] = { category: isWorkout ? "workout" : "other", workoutType: type, at: now.toISOString() };
  if (remember) {
    const norm = normalizeTitle(ev.title);
    state.titleMappings = state.titleMappings.filter((m) => m.title !== norm);
    state.titleMappings.push({ title: norm, category: isWorkout ? "workout" : "other", workoutType: type, createdAt: now.toISOString() });
  }
  recordFeedback(state, "classification_corrected", { to: isWorkout ? "workout" : "other", workoutType: type, remembered: remember }, now);
  recompute(state, now, { trigger: "classification" });
  return ok(isWorkout ? "Marked as a workout. Suggestions updated." : "Marked as not a workout. Suggestions updated.");
}

/** Forget a remembered title mapping. */
export function forgetTitleMapping(state: AppState, title: string, now: Date): ActionResult {
  state.titleMappings = state.titleMappings.filter((m) => m.title !== title);
  recompute(state, now, { trigger: "mapping_removed" });
  return ok("Forgotten.");
}

/* ───────────── Caffeine ───────────── */

export function logExternalCaffeine(state: AppState, label: string, mg: number | null, now: Date): ActionResult {
  const clean = label.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 40) || "Caffeine";
  if (mg !== null && (!Number.isFinite(mg) || mg < 0 || mg > 1000)) return fail("Enter 0–1000 mg, or mark the amount as unknown.");
  state.externalCaffeine.push({ id: newId("ext"), label: clean, mg, at: now.toISOString(), localDate: localDateOf(now.getTime(), state.prefs.timezone), voidedAt: null });
  recompute(state, now, { trigger: "external_caffeine" });
  return ok(mg === null ? "Logged with unknown caffeine. Suggestions pause for today because the total can’t be verified." : "Logged.");
}

export function voidExternalCaffeine(state: AppState, id: string, now: Date): ActionResult {
  const e = state.externalCaffeine.find((x) => x.id === id);
  if (!e) return fail("That entry doesn’t exist.");
  e.voidedAt = e.voidedAt ?? now.toISOString();
  recompute(state, now, { trigger: "external_caffeine_removed" });
  return ok("Removed.");
}

/* ───────────── Inventory ───────────── */

export function correctStock(state: AppState, flavor: Flavor, count: number, now: Date): ActionResult {
  if (!FLAVORS.includes(flavor)) return fail("Choose a flavor.");
  if (!Number.isInteger(count) || count < 0 || count > 500) return fail("Enter a whole number from 0 to 500.");
  const current = stockByFlavor(state)[flavor];
  const delta = count - current;
  if (delta === 0) return ok("Stock already matches.");
  state.inventory.push({ id: newId("inv"), flavor, delta, reason: "correction", basis: "logged", at: now.toISOString() });
  state.stockCorrectedAt[flavor] = now.toISOString();
  recordFeedback(state, "inventory_corrected", { flavor, delta }, now);
  recompute(state, now, { trigger: "stock_correction" });
  return ok(`${flavor[0]!.toUpperCase()}${flavor.slice(1)} stock set to ${count}.`);
}

/* ───────────── Preferences ───────────── */

export function markNoticesRead(state: AppState): ActionResult {
  for (const n of state.notices) n.read = true;
  return ok("Marked read.");
}

export function setPlanningTimezone(state: AppState, tz: string, now: Date): ActionResult {
  if (!isValidTimezone(tz)) return fail("Unknown timezone.");
  if (tz === state.prefs.timezone) return ok("Planning timezone unchanged.");
  state.prefs.timezone = tz;
  state.prefs.provenance.timezone = "explicit";
  recompute(state, now, { trigger: "timezone_change" });
  return ok(`Planning timezone is now ${tz}. Daily limits use this zone from now on.`);
}
