import { BriefOutputSchema } from "@/lib/ai/schemas";
import type { AiProvider, BriefInput } from "@/lib/ai/provider";
import { dayContext } from "./candidates";
import { formatClock, formatDayShort, formatTime, addDays, localDateOf, weekStartOf, weekdayName, weekdayOf } from "./time";
import type { AppState, LocalDate, WeeklyBrief } from "./types";
import { FLAVORS } from "@/config/products";

/**
 * Weekly planning brief (AI feature 3). Built from the VALIDATED plan:
 * actual workouts, busy periods and recommendations. The model only phrases
 * what's in `BriefInput`; output is grounding-checked and a deterministic
 * fallback is always available.
 */

const SHOWN = new Set(["proposed", "accepted", "completed"]);

export function buildBriefInput(state: AppState, now: Date): BriefInput {
  const tz = state.prefs.timezone;
  const weekStart = weekStartOf(localDateOf(now.getTime(), tz));
  const days: BriefInput["days"] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const ctx = dayContext(state, date);
    const recs = state.recommendations.filter((r) => SHOWN.has(r.status) && r.localDate === date);
    const run = state.planRuns[0]?.days.find((d) => d.date === date);
    days.push({
      date,
      label: weekdayName(weekdayOf(date)),
      workouts: ctx.workouts.map((w) => ({ type: w.type, start: formatTime(Date.parse(w.event.startUtc), tz) })),
      busyHours: Math.round(ctx.busyHours * 10) / 10,
      recommendations: recs.map((r) => ({ id: r.id, time: formatTime(Date.parse(r.startUtc), tz), flavor: r.flavor, status: r.status })),
      note: recs.length === 0 && run?.messages[0] ? run.messages[0] : null,
    });
  }
  return { weekStart, days };
}

const join = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);

export function deterministicBrief(input: BriefInput): { headline: string; paragraphs: string[]; referencedRecommendationIds: string[] } {
  const workouts = input.days.flatMap((d) => d.workouts.map((w) => ({ day: d.label, ...w })));
  const busy = input.days.filter((d) => d.busyHours >= 4);
  const recs = input.days.flatMap((d) => d.recommendations.map((r) => ({ day: d.label, ...r })));
  const open = recs.filter((r) => r.status !== "completed");
  const paragraphs: string[] = [];
  paragraphs.push(
    workouts.length
      ? `Workouts on your calendar: ${join(workouts.map((w) => `${w.day} ${w.type} at ${w.start}`))}. These are scheduled events, not confirmation they happened.`
      : "No workouts are on your calendar this week.",
  );
  paragraphs.push(
    busy.length
      ? `Busiest days: ${join(busy.map((d) => `${d.label} (${d.busyHours} h of events)`))}.`
      : "No day this week passes the busy-day threshold.",
  );
  paragraphs.push(
    open.length
      ? `Suggested drinks: ${join(open.map((r) => `${r.day} ${r.time}, ${r.flavor} (${r.status})`))}. Each is optional and you can edit or dismiss it.`
      : "No drinks are suggested right now. That’s a valid plan.",
  );
  const noted = input.days.filter((d) => d.note);
  if (noted.length) paragraphs.push(`Notes: ${noted.slice(0, 2).map((d) => `${d.label}: ${d.note}`).join(" ")}`);
  const headline = open.length === 0 ? "A light week for drinks" : `${open.length} suggested drink${open.length === 1 ? "" : "s"} across ${new Set(open.map((r) => r.day)).size} day${new Set(open.map((r) => r.day)).size === 1 ? "" : "s"}`;
  return { headline, paragraphs, referencedRecommendationIds: recs.map((r) => r.id) };
}

/** Reject model text that mentions things the plan doesn't contain. */
export function isGrounded(text: string, input: BriefInput): boolean {
  const allowedTimes = new Set<string>();
  const allowedFlavors = new Set<string>();
  const allowedDays = new Set(input.days.map((d) => d.label.toLowerCase()));
  const timeRe = /\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/gi;
  for (const d of input.days) {
    for (const m of (d.note ?? "").matchAll(timeRe)) allowedTimes.add(m[1]!.toLowerCase().replace(/\s/g, ""));
    for (const w of d.workouts) allowedTimes.add(w.start.toLowerCase().replace(/\s/g, ""));
    for (const r of d.recommendations) {
      allowedTimes.add(r.time.toLowerCase().replace(/\s/g, ""));
      allowedFlavors.add(r.flavor);
    }
  }
  const lower = text.toLowerCase();
  if (/\b(shipment|delivery|delivered|inventory|in stock|nutrition|protein needs|calories|meal)\b/.test(lower)) return false;
  for (const m of lower.matchAll(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/g)) {
    if (!allowedTimes.has(m[1]!.replace(/\s/g, ""))) return false;
  }
  for (const f of FLAVORS) if (lower.includes(f) && !allowedFlavors.has(f)) return false;
  for (const m of lower.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)) {
    if (!allowedDays.has(m[1]!)) return false;
  }
  return true;
}

export async function generateBrief(state: AppState, now: Date, ai: AiProvider): Promise<WeeklyBrief> {
  const input = buildBriefInput(state, now);
  const fallback = deterministicBrief(input);
  const validIds = new Set(input.days.flatMap((d) => d.recommendations.map((r) => r.id)));
  let source: WeeklyBrief["source"] = "deterministic";
  let out = fallback;
  if (!ai.isMock) {
    try {
      const raw = await ai.writeBrief(input);
      const parsed = BriefOutputSchema.safeParse(raw);
      if (parsed.success && parsed.data.referencedRecommendationIds.every((id) => validIds.has(id)) && [parsed.data.headline, ...parsed.data.paragraphs].every((t) => isGrounded(t, input))) {
        out = parsed.data;
        source = "llm";
      }
    } catch {
      // fall through to the deterministic brief
    }
  } else {
    source = "mock_llm";
  }
  return { weekStart: input.weekStart as LocalDate, generatedAt: now.toISOString(), source, headline: out.headline, paragraphs: out.paragraphs, referencedRecommendationIds: out.referencedRecommendationIds };
}

export { formatClock, formatDayShort };
