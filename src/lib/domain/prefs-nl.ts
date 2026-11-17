import { FLAVORS, type Flavor } from "@/config/products";
import { PrefParseOutputSchema, SUPPORTED_PREF_FIELDS, type PrefParseOutput } from "@/lib/ai/schemas";
import { sanitizeUntrustedText, type AiProvider } from "@/lib/ai/provider";
import { validatePreferences } from "./prefs";
import { formatClock, minutesToHHmm, weekdayName } from "./time";
import type { AppState, Preferences } from "./types";

/**
 * Natural-language preferences (AI feature 4).
 * AI proposes -> policy validates -> user confirms (apply is a separate action).
 * The parser may only emit SUPPORTED_PREF_FIELDS. Output is Zod-validated,
 * mapped into a typed patch, then validated with the same rules as the forms.
 */

export interface PrefDiff {
  label: string;
  before: string;
  after: string;
}

export type PrefProposal =
  | { kind: "preview"; summary: string; patch: Partial<Preferences>; diff: PrefDiff[]; source: "mock" | "llm" }
  | { kind: "clarify"; question: string; options: string[]; needs: "office_days" | "choice" }
  | { kind: "unsupported"; reason: string }
  | { kind: "rejected"; reason: string };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function clock(h: number, mi: number, ap: string | undefined, fallback: "am" | "pm"): string | null {
  if (h > 24 || mi > 59) return null;
  let hour = h;
  const period = ap ?? (h >= 13 ? undefined : fallback);
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  return minutesToHHmm(hour * 60 + mi);
}

function parseTimeAfter(re: RegExp, text: string, fallback: "am" | "pm"): string | null {
  const m = re.exec(text);
  if (!m) return null;
  return clock(Number(m[1]), m[2] ? Number(m[2]) : 0, m[3]?.toLowerCase(), fallback);
}

const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`;

/** Deterministic mock parser used in demo mode and as the no-credentials fallback. */
export function mockParsePreferences(textRaw: string): PrefParseOutput {
  const text = sanitizeUntrustedText(textRaw, 300).toLowerCase();
  const changes: PrefParseOutput["changes"] = [];
  const push = (field: (typeof SUPPORTED_PREF_FIELDS)[number], value: string | number | boolean | (string | number)[]) => changes.push({ field, value });

  const quietEnd = parseTimeAfter(new RegExp(String.raw`(?:no|stop|pause|hold)\s+(?:the\s+)?(?:reminders?|notifications?|nudges?)\s+before\s+${TIME}`), text, "am");
  if (quietEnd) push("quietHoursEnd", quietEnd);
  const quietStart = parseTimeAfter(new RegExp(String.raw`(?:no|stop|pause|hold)\s+(?:the\s+)?(?:reminders?|notifications?|nudges?)\s+after\s+${TIME}`), text, "pm");
  if (quietStart) push("quietHoursStart", quietStart);

  if (/only\s+(?:suggest\s+)?(?:drinks?\s+)?(?:\w+\s+)?after\s+(?:my\s+|a\s+)?workouts?/.test(text)) {
    push("timing", "after");
    push("busyDaySuggestions", false);
  } else if (/only\s+(?:suggest\s+)?(?:drinks?\s+)?(?:\w+\s+)?before\s+(?:my\s+|a\s+)?workouts?/.test(text)) {
    push("timing", "before");
    push("busyDaySuggestions", false);
  } else if (/\b(prefer|rather)\b.*\bafter\b.*\bworkouts?\b/.test(text)) push("timing", "after");
  else if (/\b(prefer|rather)\b.*\bbefore\b.*\bworkouts?\b/.test(text)) push("timing", "before");

  const oneDrink = /\b(one|1)\s+drink/.test(text) || /\bjust one\b/.test(text);
  const nDrinks = /\b(?:keep|limit|up to|at most|max(?:imum)?|suggest)\b[^.]*?\b(\d|zero|one|two|three|four|five|six)\s+drinks?\b/.exec(text);
  if (nDrinks) {
    const n = NUMBER_WORDS[nDrinks[1]!] ?? Number(nDrinks[1]);
    push("maxDrinksPerDay", n);
  } else if (oneDrink && /(keep|limit|only|just)/.test(text)) push("maxDrinksPerDay", 1);

  const flavorMatch = /\bprefer\s+(chai|oolong|matcha)\b/.exec(text) ?? /\b(chai|oolong|matcha)\b[^.]*\b(?:is|as)\b[^.]*\b(?:favorite|favourite|top)\b/.exec(text);
  if (flavorMatch) {
    if (/\boffice\s+days?\b/.test(text)) push("flavorOnOfficeDays", flavorMatch[1]!);
    else push("flavorRank", [flavorMatch[1]!]);
  }
  const officeList = /\b(?:my\s+)?office\s+days?\s+(?:are|is)\s+([a-z,\s&]+)/.exec(text);
  if (officeList) {
    const days = WEEKDAYS.map((d, i) => (new RegExp(`\\b${d.slice(0, 3)}`).test(officeList[1]!) ? i : -1)).filter((i) => i >= 0);
    if (days.length) push("officeDays", days);
  }

  const cutoff = parseTimeAfter(new RegExp(String.raw`(?:no\s+caffeine|caffeine\s+cut-?off|cut-?off)\s+(?:at\s+|after\s+|is\s+)?${TIME}`), text, "pm");
  if (cutoff) push("caffeineCutoff", cutoff);
  const ceiling = /\b(?:caffeine\s+)?(?:ceiling|limit)\s+(?:to|of|at)\s+(\d{2,4})\s*mg/.exec(text);
  if (ceiling) push("caffeineCeilingMg", Number(ceiling[1]));

  if (/\b(?:turn on|enable|start|send me)\b[^.]*\bemail/.test(text)) push("remindersEmail", true);
  else if (/\b(?:turn off|disable|stop|no more)\b[^.]*\bemail/.test(text)) push("remindersEmail", false);
  if (/\b(?:turn off|disable|stop)\b[^.]*\b(?:in-?app|app)\s+(?:reminders?|notifications?)/.test(text)) push("remindersInApp", false);
  const lead = /\bremind(?:ers?)?\s+(?:me\s+)?(\d{1,3})\s*(?:min|minutes)\s+before/.exec(text);
  if (lead) push("reminderLeadMinutes", Number(lead[1]));

  if (/\b(?:don'?t|do not|no)\b[^.]*\bbusy days?\b/.test(text)) push("busyDaySuggestions", false);
  else if (/\b(?:suggest|include)\b[^.]*\bbusy days?\b/.test(text)) push("busyDaySuggestions", true);

  if (changes.length > 0) return { intent: "update", changes, clarification: null, options: null, unsupportedReason: null };
  if (/\b(fewer|less|too many|too much|slow down)\b/.test(text)) {
    return {
      intent: "clarify",
      changes: [],
      clarification: "What would you like to reduce? I can limit suggestions to one drink a day, only suggest after workouts, or move your quiet hours.",
      options: ["One drink per day", "Only after workouts", "Later reminders"],
      unsupportedReason: null,
    };
  }
  return {
    intent: "unsupported",
    changes: [],
    clarification: null,
    options: null,
    unsupportedReason:
      "I can change quiet hours, before/after-workout timing, busy-day suggestions, drinks per day (up to 2), caffeine cutoff or ceiling (lower only), flavor preference, office-day flavor, and reminder channels.",
  };
}

const fmtFlavor = (f: string) => f[0]!.toUpperCase() + f.slice(1);
const fmtTiming = (t: string) => (t === "after" ? "After workouts" : t === "before" ? "Before workouts" : "Before or after");
const fmtDays = (d: number[] | null) => (d && d.length ? d.map((x) => weekdayName(x, false)).join(", ") : "Not set");

/** Build a typed patch from validated parser output. Returns a refusal when a request can't be honored. */
function toPatch(out: PrefParseOutput, prefs: Preferences): { patch: Partial<Preferences>; unsupported?: string; needsOffice?: Flavor } {
  const patch: Partial<Preferences> = {};
  let needsOffice: Flavor | undefined;
  for (const c of out.changes) {
    const v = c.value;
    switch (c.field) {
      case "quietHoursEnd":
        if (typeof v !== "string") return { patch, unsupported: "I couldn’t read that time." };
        patch.quietHours = { ...(patch.quietHours ?? prefs.quietHours), end: v };
        break;
      case "quietHoursStart":
        if (typeof v !== "string") return { patch, unsupported: "I couldn’t read that time." };
        patch.quietHours = { ...(patch.quietHours ?? prefs.quietHours), start: v };
        break;
      case "timing":
        if (v !== "before" && v !== "after" && v !== "either") return { patch, unsupported: "Timing must be before, after, or either." };
        patch.timing = v;
        break;
      case "busyDaySuggestions":
        if (typeof v !== "boolean") return { patch, unsupported: "I couldn’t read that." };
        patch.busyDaySuggestions = v;
        break;
      case "maxDrinksPerDay":
        if (typeof v !== "number") return { patch, unsupported: "I couldn’t read that number." };
        patch.maxDrinksPerDay = v;
        break;
      case "caffeineCutoff":
        if (typeof v !== "string") return { patch, unsupported: "I couldn’t read that time." };
        patch.caffeineCutoff = v;
        break;
      case "caffeineCeilingMg":
        if (typeof v !== "number") return { patch, unsupported: "I couldn’t read that amount." };
        patch.caffeineCeilingMg = v;
        break;
      case "flavorRank": {
        const list = (Array.isArray(v) ? v : [v]).filter((x): x is Flavor => typeof x === "string" && (FLAVORS as readonly string[]).includes(x));
        if (!list.length) return { patch, unsupported: "That isn’t one of our flavors." };
        patch.flavorRank = [...list, ...prefs.flavorRank.filter((f) => !list.includes(f))];
        break;
      }
      case "flavorOnOfficeDays": {
        if (typeof v !== "string" || !(FLAVORS as readonly string[]).includes(v)) return { patch, unsupported: "That isn’t one of our flavors." };
        patch.flavorByDayType = { ...prefs.flavorByDayType, office: v as Flavor };
        needsOffice = v as Flavor;
        break;
      }
      case "officeDays": {
        const days = (Array.isArray(v) ? v : [v]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
        patch.officeDays = [...new Set(days)].sort();
        break;
      }
      case "remindersEmail":
        if (v === true) return { patch, unsupported: "Email reminders are opt-in and need your address and consent. Turn them on under Account → Notifications." };
        patch.reminders = { ...(patch.reminders ?? prefs.reminders), email: false };
        break;
      case "remindersInApp":
        patch.reminders = { ...(patch.reminders ?? prefs.reminders), inApp: v === true };
        break;
      case "reminderLeadMinutes":
        if (typeof v !== "number") return { patch, unsupported: "I couldn’t read that number." };
        patch.reminders = { ...(patch.reminders ?? prefs.reminders), leadMinutes: v };
        break;
    }
  }
  return { patch, ...(needsOffice ? { needsOffice } : {}) };
}

function diffFor(patch: Partial<Preferences>, prefs: Preferences): PrefDiff[] {
  const d: PrefDiff[] = [];
  if (patch.quietHours) {
    const b = `${formatClock(prefs.quietHours.start)} – ${formatClock(prefs.quietHours.end)}`;
    const a = `${formatClock(patch.quietHours.start)} – ${formatClock(patch.quietHours.end)}`;
    d.push({ label: "Quiet hours (no reminders)", before: b, after: a });
  }
  if (patch.timing) d.push({ label: "Drink timing", before: fmtTiming(prefs.timing), after: fmtTiming(patch.timing) });
  if (patch.busyDaySuggestions !== undefined) d.push({ label: "Busy-day suggestions", before: prefs.busyDaySuggestions ? "On" : "Off", after: patch.busyDaySuggestions ? "On" : "Off" });
  if (patch.maxDrinksPerDay !== undefined) d.push({ label: "Max drinks per day", before: String(prefs.maxDrinksPerDay), after: String(patch.maxDrinksPerDay) });
  if (patch.caffeineCutoff) d.push({ label: "Caffeine cutoff", before: formatClock(prefs.caffeineCutoff), after: formatClock(patch.caffeineCutoff) });
  if (patch.caffeineCeilingMg !== undefined) d.push({ label: "Caffeine ceiling", before: `${prefs.caffeineCeilingMg} mg`, after: `${patch.caffeineCeilingMg} mg` });
  if (patch.flavorRank) d.push({ label: "Top flavor", before: fmtFlavor(prefs.flavorRank[0] ?? "—"), after: fmtFlavor(patch.flavorRank[0] ?? "—") });
  if (patch.flavorByDayType) d.push({ label: "Flavor on office days", before: prefs.flavorByDayType.office ? fmtFlavor(prefs.flavorByDayType.office) : "No preference", after: patch.flavorByDayType.office ? fmtFlavor(patch.flavorByDayType.office) : "No preference" });
  if (patch.officeDays) d.push({ label: "Office days (you confirmed)", before: fmtDays(prefs.officeDays), after: fmtDays(patch.officeDays) });
  if (patch.reminders) {
    if (patch.reminders.email !== prefs.reminders.email) d.push({ label: "Email reminders", before: prefs.reminders.email ? "On" : "Off", after: patch.reminders.email ? "On" : "Off" });
    if (patch.reminders.inApp !== prefs.reminders.inApp) d.push({ label: "In-app reminders", before: prefs.reminders.inApp ? "On" : "Off", after: patch.reminders.inApp ? "On" : "Off" });
    if (patch.reminders.leadMinutes !== prefs.reminders.leadMinutes) d.push({ label: "Reminder lead time", before: `${prefs.reminders.leadMinutes} min`, after: `${patch.reminders.leadMinutes} min` });
  }
  return d;
}

/**
 * Produce a proposal. `confirmedOfficeDays` is the user's explicit answer to
 * the office-day clarification (never inferred).
 */
export async function proposePreferenceChange(
  state: Pick<AppState, "prefs">,
  text: string,
  ai: AiProvider,
  opts: { confirmedOfficeDays?: number[] } = {},
): Promise<PrefProposal> {
  const clean = sanitizeUntrustedText(text, 300);
  if (clean.length < 3) return { kind: "unsupported", reason: "Tell me what you’d like to change, e.g. “No reminders before 8.”" };

  let raw: unknown;
  try {
    raw = ai.isMock ? mockParsePreferences(clean) : await ai.parsePreferences({ text: clean, supportedFields: SUPPORTED_PREF_FIELDS });
  } catch {
    raw = null;
  }
  let parsed = PrefParseOutputSchema.safeParse(raw);
  if (!parsed.success) {
    // Malformed model output: degrade to the deterministic parser rather than guessing.
    parsed = PrefParseOutputSchema.safeParse(mockParsePreferences(clean));
    if (!parsed.success) return { kind: "unsupported", reason: "I couldn’t understand that. Try rephrasing, or change it directly in Account." };
  }
  const out = parsed.data;
  if (out.intent === "clarify") {
    return { kind: "clarify", question: out.clarification ?? "Can you say more?", options: out.options ?? [], needs: "choice" };
  }
  if (out.intent === "unsupported" || out.changes.length === 0) {
    return { kind: "unsupported", reason: out.unsupportedReason ?? "That isn’t something I can change." };
  }
  if (opts.confirmedOfficeDays && opts.confirmedOfficeDays.length) out.changes.push({ field: "officeDays", value: opts.confirmedOfficeDays });

  const { patch, unsupported, needsOffice } = toPatch(out, state.prefs);
  if (unsupported) return { kind: "unsupported", reason: unsupported };
  if (needsOffice && !(patch.officeDays ?? state.prefs.officeDays)?.length) {
    return {
      kind: "clarify",
      question: `Which days are your office days? I don’t assume this from your calendar — you tell me.`,
      options: WEEKDAYS.map((_, i) => String(i)),
      needs: "office_days",
    };
  }
  const merged = { ...state.prefs, ...patch } as Preferences;
  const issues = validatePreferences(merged);
  if (issues.length) return { kind: "rejected", reason: issues[0]!.message };
  const diff = diffFor(patch, state.prefs);
  if (diff.length === 0) return { kind: "unsupported", reason: "That already matches your current settings." };
  return {
    kind: "preview",
    patch,
    diff,
    summary: diff.map((x) => `${x.label}: ${x.before} → ${x.after}`).join("; "),
    source: ai.isMock ? "mock" : "llm",
  };
}

export const NL_EXAMPLES = ["No reminders before 8", "Only suggest drinks after workouts", "I prefer matcha on office days", "Keep suggestions to one drink per day"];
