import { z } from "zod";
import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { FLAVORS, DIETARY_OPTIONS, type Flavor } from "@/config/products";
import type { ActionResult } from "./actions";
import { recompute } from "./engine";
import { recordFeedback } from "./feedback";
import { newId } from "./ids";
import { isHHmm, isValidTimezone } from "./time";
import type { AppState, PrefChangeRecord, Preferences, Provenance } from "./types";

export function defaultPreferences(timezone: string, cfg: PolicyConfig = defaultPolicy): Preferences {
  return {
    flavorRank: [],
    timing: "either",
    busyDaySuggestions: true,
    maxDrinksPerDay: cfg.maxDrinksPerDay,
    reminders: { inApp: true, email: false, emailAddress: null, leadMinutes: cfg.reminders.defaultLeadMinutes },
    quietHours: { ...cfg.quietHoursDefault },
    caffeineCeilingMg: cfg.caffeine.defaultCeilingMg,
    caffeineCutoff: cfg.caffeineCutoffDefault,
    dietary: [],
    timezone,
    officeDays: null,
    flavorByDayType: {},
    busyHoursThreshold: cfg.busyDay.occupiedHoursThreshold,
    provenance: {},
  };
}

export interface PrefIssue {
  field: string;
  message: string;
}

/** Product-policy validation of a full preference object. Used by forms AND natural-language changes. */
export function validatePreferences(p: Preferences, cfg: PolicyConfig = defaultPolicy): PrefIssue[] {
  const issues: PrefIssue[] = [];
  const bad = (field: string, message: string) => issues.push({ field, message });
  if (!Number.isInteger(p.maxDrinksPerDay) || p.maxDrinksPerDay < 1) bad("maxDrinksPerDay", "Choose at least 1 drink per day.");
  else if (p.maxDrinksPerDay > cfg.maxDrinksPerDay) bad("maxDrinksPerDay", `Interval suggests at most ${cfg.maxDrinksPerDay} drinks per day. That limit can’t be raised.`);
  if (!Number.isFinite(p.caffeineCeilingMg) || p.caffeineCeilingMg < cfg.caffeine.minCeilingMg)
    bad("caffeineCeilingMg", `Choose a ceiling of at least ${cfg.caffeine.minCeilingMg} mg.`);
  else if (p.caffeineCeilingMg > cfg.caffeine.defaultCeilingMg)
    bad("caffeineCeilingMg", `The ceiling can be lowered but not raised above the ${cfg.caffeine.defaultCeilingMg} mg general-guidance default.`);
  if (!isHHmm(p.caffeineCutoff)) bad("caffeineCutoff", "Use a time like 15:00.");
  if (!isHHmm(p.quietHours.start) || !isHHmm(p.quietHours.end)) bad("quietHours", "Quiet hours need valid start and end times.");
  if (!isValidTimezone(p.timezone)) bad("timezone", "Unknown timezone.");
  if (!Number.isInteger(p.reminders.leadMinutes) || p.reminders.leadMinutes < 0 || p.reminders.leadMinutes > 180) bad("reminders", "Reminder lead time must be 0–180 minutes.");
  if (p.reminders.email && !(p.reminders.emailAddress && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.reminders.emailAddress))) bad("reminders", "Email reminders need a valid address.");
  if (!p.flavorRank.every((f) => FLAVORS.includes(f)) || new Set(p.flavorRank).size !== p.flavorRank.length) bad("flavorRank", "Flavor preferences are invalid.");
  if (!p.dietary.every((d) => DIETARY_OPTIONS.some((o) => o.id === d))) bad("dietary", "Unknown dietary option.");
  if (p.officeDays && !p.officeDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) bad("officeDays", "Office days must be weekdays.");
  if (!Number.isFinite(p.busyHoursThreshold) || p.busyHoursThreshold < 1 || p.busyHoursThreshold > 12) bad("busyHoursThreshold", "Busy-day threshold must be 1–12 hours.");
  return issues;
}

export const PrefsFormSchema = z
  .object({
    flavorRank: z.array(z.enum(FLAVORS)).max(3),
    timing: z.enum(["before", "after", "either"]),
    busyDaySuggestions: z.boolean(),
    maxDrinksPerDay: z.number().int(),
    remindersInApp: z.boolean(),
    remindersEmail: z.boolean(),
    emailAddress: z.string().max(200).nullable(),
    leadMinutes: z.number().int(),
    quietStart: z.string(),
    quietEnd: z.string(),
    caffeineCeilingMg: z.number(),
    caffeineCutoff: z.string(),
    dietary: z.array(z.string().max(30)).max(10),
    timezone: z.string().max(60),
    busyHoursThreshold: z.number(),
  })
  .partial();
export type PrefsForm = z.infer<typeof PrefsFormSchema>;

const FIELD_PROVENANCE: Record<string, string> = {
  flavorRank: "flavorRank",
  timing: "timing",
  busyDaySuggestions: "busyDaySuggestions",
  maxDrinksPerDay: "maxDrinksPerDay",
  remindersInApp: "reminders",
  remindersEmail: "reminders",
  emailAddress: "reminders",
  leadMinutes: "reminders",
  quietStart: "quietHours",
  quietEnd: "quietHours",
  caffeineCeilingMg: "caffeineCeilingMg",
  caffeineCutoff: "caffeineCutoff",
  dietary: "dietary",
  timezone: "timezone",
  busyHoursThreshold: "busyHoursThreshold",
};

/** Apply explicit preference edits from onboarding/account forms. */
export function updatePreferences(state: AppState, input: unknown, now: Date): ActionResult {
  const parsed = PrefsFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some settings are invalid." };
  const f = parsed.data;
  const next: Preferences = structuredClone(state.prefs);
  const touched = new Set<string>();
  const set = (k: keyof PrefsForm, fn: () => void) => {
    if (f[k] !== undefined) {
      fn();
      touched.add(FIELD_PROVENANCE[k] as string);
    }
  };
  set("flavorRank", () => (next.flavorRank = f.flavorRank as Flavor[]));
  set("timing", () => (next.timing = f.timing!));
  set("busyDaySuggestions", () => (next.busyDaySuggestions = f.busyDaySuggestions!));
  set("maxDrinksPerDay", () => (next.maxDrinksPerDay = f.maxDrinksPerDay!));
  set("remindersInApp", () => (next.reminders.inApp = f.remindersInApp!));
  set("remindersEmail", () => (next.reminders.email = f.remindersEmail!));
  set("emailAddress", () => (next.reminders.emailAddress = f.emailAddress ? f.emailAddress.trim() : null));
  set("leadMinutes", () => (next.reminders.leadMinutes = f.leadMinutes!));
  set("quietStart", () => (next.quietHours.start = f.quietStart!));
  set("quietEnd", () => (next.quietHours.end = f.quietEnd!));
  set("caffeineCeilingMg", () => (next.caffeineCeilingMg = f.caffeineCeilingMg!));
  set("caffeineCutoff", () => (next.caffeineCutoff = f.caffeineCutoff!));
  set("dietary", () => (next.dietary = f.dietary!));
  set("timezone", () => (next.timezone = f.timezone!));
  set("busyHoursThreshold", () => (next.busyHoursThreshold = f.busyHoursThreshold!));
  const issues = validatePreferences(next);
  if (issues.length) return { ok: false, error: issues[0]!.message };

  if (state.prefs.reminders.email && !next.reminders.email) recordFeedback(state, "notification_optout", { channel: "email" }, now);
  if (state.prefs.reminders.inApp && !next.reminders.inApp) recordFeedback(state, "notification_optout", { channel: "in_app" }, now);
  const prov: Record<string, Provenance> = { ...state.prefs.provenance };
  for (const t of touched) prov[t] = "explicit";
  next.provenance = prov;
  state.prefs = next;
  recompute(state, now, { trigger: "preferences" });
  return { ok: true, message: "Saved." };
}

/* ───────────── Confirmed natural-language changes: apply + undo ───────────── */

export function applyPrefPatch(state: AppState, patch: Partial<Preferences>, summary: string, now: Date): ActionResult<{ changeId: string }> {
  const keys = Object.keys(patch) as (keyof Preferences)[];
  if (keys.length === 0) return { ok: false, error: "Nothing to change." };
  const merged: Preferences = { ...structuredClone(state.prefs), ...structuredClone(patch) } as Preferences;
  const issues = validatePreferences(merged);
  if (issues.length) return { ok: false, error: issues[0]!.message };
  const before: Partial<Preferences> = {};
  for (const k of keys) (before as Record<string, unknown>)[k] = structuredClone(state.prefs[k]);
  const beforeProv: Record<string, Provenance | undefined> = {};
  for (const k of keys) beforeProv[k] = state.prefs.provenance[k];
  const rec: PrefChangeRecord = { id: newId("pc"), at: now.toISOString(), summary: summary.slice(0, 200), before: { ...before, provenance: beforeProv as Record<string, Provenance> }, after: structuredClone(patch), undoneAt: null };
  merged.provenance = { ...state.prefs.provenance };
  for (const k of keys) if (k !== "provenance") merged.provenance[k] = "confirmed_interpretation";
  state.prefs = merged;
  state.prefChanges.unshift(rec);
  state.prefChanges = state.prefChanges.slice(0, 30);
  recordFeedback(state, "pref_change_confirmed", { fields: keys.join(",") }, now, undefined);
  recompute(state, now, { trigger: "pref_nl" });
  return { ok: true, message: "Preference updated.", changeId: rec.id };
}

export function undoPrefChange(state: AppState, changeId: string, now: Date): ActionResult {
  const rec = state.prefChanges.find((c) => c.id === changeId);
  if (!rec) return { ok: false, error: "That change doesn’t exist." };
  if (rec.undoneAt) return { ok: true, message: "Already undone." };
  const restoredProv = (rec.before.provenance ?? {}) as Record<string, Provenance | undefined>;
  const { provenance: _drop, ...restore } = structuredClone(rec.before);
  void _drop;
  const merged: Preferences = { ...structuredClone(state.prefs), ...restore };
  merged.provenance = { ...state.prefs.provenance };
  for (const k of Object.keys(rec.after)) {
    const p = restoredProv[k];
    if (p) merged.provenance[k] = p;
    else delete merged.provenance[k];
  }
  state.prefs = merged;
  rec.undoneAt = now.toISOString();
  const confirmed = [...state.feedback].reverse().find((e) => e.type === "pref_change_confirmed" && !state.feedback.some((x) => x.compensates === e.id));
  recordFeedback(state, "pref_change_undone", { fields: Object.keys(rec.after).join(",") }, now, undefined, false, confirmed?.id);
  recompute(state, now, { trigger: "pref_undo" });
  return { ok: true, message: "Undone. Your previous preferences are back." };
}
