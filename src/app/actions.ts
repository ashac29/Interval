"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FLAVORS, OFFERS, type Flavor, type OfferId } from "@/config/products";
import { getAi } from "@/lib/ai";
import * as A from "@/lib/domain/actions";
import * as C from "@/lib/domain/commerce";
import { generateBrief } from "@/lib/domain/brief";
import { recompute } from "@/lib/domain/engine";
import { recordFeedback } from "@/lib/domain/feedback";
import { buildScenario, DEFAULT_SCENARIO, SCENARIOS } from "@/lib/domain/fixtures";
import { newId } from "@/lib/domain/ids";
import { applyPrefPatch, undoPrefChange, updatePreferences } from "@/lib/domain/prefs";
import { proposePreferenceChange } from "@/lib/domain/prefs-nl";
import { processDueJobs, syncReminders } from "@/lib/domain/reminders";
import { isValidTimezone, isoOf, zonedToUtcMs, parseHHmm, isHHmm } from "@/lib/domain/time";
import type { DismissReason, LocalDate } from "@/lib/domain/types";
import { afterCalendarChange, refreshDemoCalendar, refreshLiveCalendar } from "@/lib/calendar-refresh";
import { getEmailAdapter } from "@/lib/mail";
import { act, DEMO_COOKIE, DEMO_SCENARIO_COOKIE, demoCookieOptions, demoStore, getCtx, type MutationResult } from "@/lib/session";
import { policy } from "@/config/policy";
import type { PrefProposal } from "@/lib/domain/prefs-nl";

/**
 * Server actions. Every mutation: resolves the caller's own state (demo cookie or
 * authenticated user), runs a policy-validated domain function inside the store's
 * serialized section, and returns a plain {ok,message|error}. Inputs are re-validated
 * here; the client is never trusted.
 */

const flavorSchema = z.enum(FLAVORS);
const idSchema = z.string().min(1).max(100);
const bad = (error = "That request wasn’t valid."): MutationResult => ({ ok: false, error });

/* ───────────── Recommendations ───────────── */

export async function acceptRec(recId: string): Promise<MutationResult> {
  if (!idSchema.safeParse(recId).success) return bad();
  return act((s, now) => A.acceptRecommendation(s, recId, now));
}
export async function undoAcceptRec(recId: string): Promise<MutationResult> {
  if (!idSchema.safeParse(recId).success) return bad();
  return act((s, now) => A.undoAcceptance(s, recId, now));
}
export async function dismissRec(recId: string, reason: DismissReason): Promise<MutationResult> {
  if (!idSchema.safeParse(recId).success) return bad();
  return act((s, now) => A.dismissRecommendation(s, recId, reason, now));
}
export async function hadOne(recId: string, key: string): Promise<MutationResult> {
  if (!idSchema.safeParse(recId).success || !idSchema.safeParse(key).success) return bad();
  return act((s, now) => A.completeRecommendation(s, recId, key, now));
}
export async function logAdHoc(flavor: Flavor, key: string): Promise<MutationResult> {
  if (!flavorSchema.safeParse(flavor).success || !idSchema.safeParse(key).success) return bad();
  return act((s, now) => A.logDrink(s, flavor, key, now));
}
export async function undoLog(consumptionId: string): Promise<MutationResult> {
  if (!idSchema.safeParse(consumptionId).success) return bad();
  return act((s, now) => A.undoConsumption(s, consumptionId, now));
}
/** Reschedule to a local time (HH:mm) on a local date in the PLANNING timezone. */
export async function rescheduleRec(recId: string, date: LocalDate, hhmm: string): Promise<MutationResult> {
  if (!idSchema.safeParse(recId).success || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isHHmm(hhmm)) return bad("Pick a valid time.");
  return act((s, now) => A.editRecommendationTime(s, recId, isoOf(zonedToUtcMs(date, parseHHmm(hhmm), s.prefs.timezone)), now));
}
export async function changeFlavor(recId: string, flavor: Flavor): Promise<MutationResult> {
  if (!idSchema.safeParse(recId).success || !flavorSchema.safeParse(flavor).success) return bad();
  return act((s, now) => A.changeRecommendationFlavor(s, recId, flavor, now));
}
export async function ackConflict(recId: string): Promise<MutationResult> {
  return act((s, now) => A.acknowledgeConflict(s, recId, now));
}
export async function recordExposureAction(ids: string[]): Promise<MutationResult> {
  if (!Array.isArray(ids)) return bad();
  return act((s, now) => A.recordExposure(s, ids.filter((x) => typeof x === "string"), now), { revalidate: false });
}

/* ───────────── Workouts / caffeine / stock ───────────── */

export async function confirmWorkoutAction(eventKey: string, isWorkout: boolean, workoutType: string | null, remember: boolean): Promise<MutationResult> {
  if (!idSchema.safeParse(eventKey).success) return bad();
  return act((s, now) => A.confirmWorkout(s, eventKey, isWorkout, workoutType, remember, now));
}
export async function forgetMapping(title: string): Promise<MutationResult> {
  return act((s, now) => A.forgetTitleMapping(s, String(title).slice(0, 160), now));
}
export async function addExternalCaffeine(label: string, mg: number | null): Promise<MutationResult> {
  return act((s, now) => A.logExternalCaffeine(s, label, mg, now));
}
export async function removeExternalCaffeine(id: string): Promise<MutationResult> {
  return act((s, now) => A.voidExternalCaffeine(s, id, now));
}
export async function setStock(flavor: Flavor, count: number): Promise<MutationResult> {
  if (!flavorSchema.safeParse(flavor).success) return bad();
  return act((s, now) => A.correctStock(s, flavor, count, now));
}

/* ───────────── Preferences ───────────── */

export async function savePrefs(input: unknown): Promise<MutationResult> {
  return act((s, now) => updatePreferences(s, input, now));
}

export async function completeOnboarding(input: unknown, displayName: string): Promise<MutationResult> {
  const res = await act((s, now) => {
    const r = updatePreferences(s, input, now);
    if (!r.ok) return r;
    s.profile.onboarded = true;
    s.profile.displayName = String(displayName ?? "").trim().slice(0, 40) || s.profile.displayName;
    recompute(s, now, { trigger: "onboarding" });
    return { ok: true as const, message: "You’re set." };
  });
  return res;
}

export async function setTimezoneAction(tz: string): Promise<MutationResult> {
  if (!isValidTimezone(tz)) return bad("Unknown timezone.");
  return act((s, now) => A.setPlanningTimezone(s, tz, now));
}

export async function previewPrefText(text: string, confirmedOfficeDays?: number[]): Promise<PrefProposal | { kind: "error"; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { kind: "error", error: "Your session has expired." };
  const days = Array.isArray(confirmedOfficeDays) ? confirmedOfficeDays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : undefined;
  try {
    return await ctx.store.mutate(ctx.id, async (state) => {
      const proposal = await proposePreferenceChange(state, String(text ?? ""), getAi(state.mode), days ? { confirmedOfficeDays: days } : {});
      state.pendingPref = proposal.kind === "preview" ? { id: newId("pp"), at: new Date().toISOString(), summary: proposal.summary, patch: proposal.patch, diff: proposal.diff } : null;
      // The proposal itself carries no secrets; ok:true so the pending slot persists.
      return Object.assign({ ok: true as const }, { proposal, pendingId: state.pendingPref?.id ?? null });
    }).then((r) => (r.proposal.kind === "preview" ? ({ ...r.proposal, pendingId: r.pendingId } as PrefProposal) : r.proposal));
  } catch {
    return { kind: "error", error: "Couldn’t read that right now. Try again." };
  }
}

export async function confirmPrefProposal(pendingId: string): Promise<MutationResult & { changeId?: string }> {
  return act((s, now) => {
    const p = s.pendingPref;
    if (!p || p.id !== pendingId) return { ok: false as const, error: "That preview expired. Ask again." };
    if (Date.parse(now.toISOString()) - Date.parse(p.at) > 30 * 60_000 && s.mode === "live") return { ok: false as const, error: "That preview expired. Ask again." };
    const r = applyPrefPatch(s, p.patch, p.summary, now);
    if (r.ok) s.pendingPref = null;
    return r;
  });
}

export async function discardPrefProposal(): Promise<MutationResult> {
  return act((s, now) => {
    if (s.pendingPref) recordFeedback(s, "pref_parse_corrected", { outcome: "discarded" }, now);
    s.pendingPref = null;
    return { ok: true as const, message: "Discarded. Nothing changed." };
  });
}

export async function undoPrefChangeAction(changeId: string): Promise<MutationResult> {
  return act((s, now) => undoPrefChange(s, changeId, now));
}

/* ───────────── Calendar ───────────── */

export async function refreshCalendar(): Promise<MutationResult> {
  return act(async (s, now, ctx) => {
    if (s.calendar.status === "not_connected") return { ok: false as const, error: "Connect a calendar first." };
    const r = s.mode === "demo" ? await refreshDemoCalendar(s, now) : await refreshLiveCalendar(s, ctx.id, now);
    return r.ok ? { ok: true as const, message: r.summary } : { ok: false as const, error: r.error };
  });
}

export async function connectDemoCalendar(): Promise<MutationResult> {
  return act(async (s, now) => {
    if (s.mode !== "demo") return { ok: false as const, error: "Use Connect Google Calendar for a live connection." };
    s.calendar.status = "connected";
    s.calendar.isDemo = true;
    s.calendar.provider = "demo";
    await refreshDemoCalendar(s, now);
    return { ok: true as const, message: "Demo calendar loaded." };
  });
}

export async function toggleCalendar(calendarId: string, selected: boolean): Promise<MutationResult> {
  return act(async (s, now) => {
    const c = s.calendar.calendars.find((x) => x.id === calendarId);
    if (!c) return { ok: false as const, error: "Calendar not found." };
    c.selected = Boolean(selected);
    await afterCalendarChange(s, now, "calendar_selection");
    return { ok: true as const, message: selected ? `Using ${c.name}.` : `Ignoring ${c.name}.` };
  });
}

export async function disconnectCalendar(): Promise<MutationResult> {
  return act(async (s, now, ctx) => {
    if (s.mode === "live") {
      const { loadCredentials, deleteCredentials } = await import("@/lib/supabase/credentials");
      const { decryptSecret } = await import("@/lib/crypto");
      const { revokeToken } = await import("@/lib/adapters/calendar");
      const { getEnv } = await import("@/lib/env");
      try {
        const creds = await loadCredentials(ctx.id);
        if (creds) {
          const key = getEnv().tokenEncryptionKey;
          if (key) await revokeToken(decryptSecret(creds.token, key));
          await deleteCredentials(ctx.id);
        }
      } catch {
        return { ok: false as const, error: "Couldn’t remove stored credentials. Nothing was disconnected — try again." };
      }
    }
    s.events = [];
    s.calendar = { ...s.calendar, status: "not_connected", provider: null, isDemo: false, calendars: [], lastSyncAt: null, lastSyncSummary: null, lastError: null, nextSyncAt: null, scopes: [] };
    s.classificationCache = {};
    recompute(s, now, { trigger: "calendar_disconnect" });
    return { ok: true as const, message: s.mode === "live" ? "Disconnected. Credentials removed and Google access revoked where supported." : "Demo calendar disconnected." };
  });
}

export async function deleteImportedData(): Promise<MutationResult> {
  return act((s, now) => {
    s.events = [];
    s.classificationCache = {};
    s.titleMappings = [];
    s.eventOverrides = {};
    for (const c of s.calendar.calendars) c.syncToken = null;
    s.calendar.lastSyncAt = null;
    s.calendar.lastSyncSummary = "Imported events deleted.";
    recompute(s, now, { trigger: "imported_data_deleted" });
    return { ok: true as const, message: "Imported calendar events, cached classifications and remembered titles were deleted." };
  });
}

/* ───────────── Weekly brief ───────────── */

export async function generateBriefAction(): Promise<MutationResult> {
  return act(async (s, now) => {
    const brief = await generateBrief(s, now, getAi(s.mode));
    s.briefs = [brief, ...s.briefs.filter((b) => b.weekStart !== brief.weekStart)].slice(0, 6);
    return { ok: true as const, message: brief.source === "llm" ? "Brief written." : brief.source === "mock_llm" ? "Brief written (demo AI)." : "Brief written from your plan." };
  });
}

/* ───────────── Notifications & reminders ───────────── */

export async function markNoticesRead(): Promise<MutationResult> {
  return act((s) => A.markNoticesRead(s), { revalidate: true });
}

/** Demo/manual: process due reminder jobs now. In live mode the durable job runner does this on a schedule. */
export async function runDueRemindersNow(): Promise<MutationResult> {
  return act(async (s, now) => {
    syncReminders(s, now);
    const sum = await processDueJobs(s, now, getEmailAdapter(s.mode));
    const parts = [`${sum.sent} in-app sent`, sum.previewed ? `${sum.previewed} email preview${sum.previewed === 1 ? "" : "s"} (nothing was emailed)` : null, sum.skipped ? `${sum.skipped} skipped` : null, sum.deferred ? `${sum.deferred} deferred` : null, sum.cancelled ? `${sum.cancelled} cancelled as stale` : null].filter(Boolean);
    return { ok: true as const, message: sum.processed ? parts.join(", ") : "No reminders are due right now." };
  });
}

/* ───────────── Demo controls ───────────── */

export async function startDemo(scenario: string): Promise<void> {
  const id = SCENARIOS.some((x) => x.id === scenario) ? scenario : DEFAULT_SCENARIO;
  const jar = await cookies();
  let visitor = jar.get(DEMO_COOKIE)?.value;
  if (!visitor || !/^[a-f0-9]{32}$/.test(visitor)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    visitor = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  const store = await demoStore();
  await store.create(visitor, await buildScenario(id));
  jar.set(DEMO_COOKIE, visitor, demoCookieOptions());
  jar.set(DEMO_SCENARIO_COOKIE, id, demoCookieOptions());
  revalidatePath("/", "layout");
  redirect("/today");
}

export async function advanceDemoClock(minutes: number): Promise<MutationResult> {
  const m = Math.max(-120, Math.min(24 * 60, Math.trunc(Number(minutes) || 0)));
  return act((s, now) => {
    if (s.mode !== "demo") return { ok: false as const, error: "The simulated clock only exists in demo mode." };
    const next = new Date(now.getTime() + m * 60_000);
    s.demoNowIso = next.toISOString();
    recompute(s, next, { trigger: "clock_advance" });
    return { ok: true as const, message: "Demo clock moved." };
  });
}

/* ───────────── Commerce (simulated) ───────────── */

const mixSchema = z.object({ chai: z.number().int().min(0).max(48), oolong: z.number().int().min(0).max(48), matcha: z.number().int().min(0).max(48) });

export async function placeOrderAction(offer: OfferId, mix: unknown, name: string, city: string): Promise<MutationResult & { orderId?: string; number?: string }> {
  const m = mixSchema.safeParse(mix);
  if (!m.success || !(offer in OFFERS)) return bad("Check your flavor selection.");
  return act((s, now) => C.placeOrder(s, { offer, mix: m.data, name: String(name ?? ""), city: String(city ?? "") }, now));
}
export async function confirmShipment(id: string): Promise<MutationResult> {
  return act((s, now) => C.confirmShipmentDelivered(s, id, now));
}
export async function confirmTrialDelivery(id: string): Promise<MutationResult> {
  return act((s, now) => C.confirmOrderDelivered(s, id, now));
}
export async function pauseSub(): Promise<MutationResult> {
  return act((s, now) => C.pauseSubscription(s, now));
}
export async function resumeSub(date: string | null): Promise<MutationResult> {
  return act((s, now) => C.resumeSubscription(s, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, now));
}
export async function skipShipment(): Promise<MutationResult> {
  return act((s, now) => C.skipNextShipment(s, now));
}
export async function advanceShipment(date: string): Promise<MutationResult> {
  return act((s, now) => C.advanceShipment(s, date, now));
}
export async function delayShipment(days: number): Promise<MutationResult> {
  if (!(policy.subscription.delayChoicesDays as readonly number[]).includes(days)) return bad();
  return act((s, now) => C.delayShipment(s, days, now));
}
export async function updateMix(mix: unknown): Promise<MutationResult> {
  const m = mixSchema.safeParse(mix);
  if (!m.success) return bad();
  return act((s, now) => C.updateSubscriptionMix(s, m.data, now));
}
export async function cancelSub(): Promise<MutationResult> {
  return act((s, now) => C.cancelSubscription(s, now));
}
export async function acceptReplen(id: string): Promise<MutationResult> {
  return act((s, now) => C.acceptReplenishment(s, id, now));
}
export async function dismissReplen(id: string): Promise<MutationResult> {
  return act((s, now) => C.dismissReplenishment(s, id, now));
}

/* ───────────── Account / privacy ───────────── */

export async function signOut(): Promise<void> {
  const ctx = await getCtx();
  if (ctx?.mode === "live") {
    const { createClient } = await import("@/lib/supabase/server");
    await (await createClient()).auth.signOut();
  }
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  jar.delete(DEMO_SCENARIO_COOKIE);
  redirect("/");
}

/** Deletes the demo visitor's state, or the live user's data, credentials and auth account. */
export async function deleteAccount(confirmText: string): Promise<MutationResult> {
  const ctx = await getCtx();
  if (!ctx) return bad("Your session has expired.");
  if (confirmText.trim().toLowerCase() !== "delete") return bad("Type DELETE to confirm.");
  try {
    if (ctx.mode === "demo") {
      await ctx.store.delete(ctx.id);
      const jar = await cookies();
      jar.delete(DEMO_COOKIE);
      jar.delete(DEMO_SCENARIO_COOKIE);
    } else {
      const { loadCredentials, deleteCredentials } = await import("@/lib/supabase/credentials");
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { decryptSecret } = await import("@/lib/crypto");
      const { revokeToken } = await import("@/lib/adapters/calendar");
      const { getEnv } = await import("@/lib/env");
      const creds = await loadCredentials(ctx.id).catch(() => null);
      const key = getEnv().tokenEncryptionKey;
      if (creds && key) await revokeToken(decryptSecret(creds.token, key)).catch(() => false);
      await deleteCredentials(ctx.id).catch(() => undefined);
      // Deleting the auth user cascades to every user-owned table (profiles, user_state, calendar_connections, feedback_events, credentials).
      const { error } = await createAdminClient().auth.admin.deleteUser(ctx.id);
      if (error) return bad("Couldn’t delete the account. Nothing further was changed — try again or contact support.");
      const { createClient } = await import("@/lib/supabase/server");
      await (await createClient()).auth.signOut().catch(() => undefined);
    }
  } catch {
    return bad("Couldn’t delete the account. Try again.");
  }
  redirect("/?deleted=1");
}

export async function exportMyData(): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Your session has expired." };
  const state = await ctx.store.get(ctx.id);
  if (!state) return { ok: false, error: "Nothing to export." };
  return { ok: true, json: JSON.stringify(state, null, 2) };
}
