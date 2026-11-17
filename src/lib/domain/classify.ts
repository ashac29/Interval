import { policy } from "@/config/policy";
import { ClassificationOutputSchema } from "@/lib/ai/schemas";
import { sanitizeUntrustedText, type AiProvider } from "@/lib/ai/provider";
import { activeEvents } from "./busy";
import { localHourOf } from "./classify-util";
import type { AppState, CalEvent, Classification, Interpretation } from "./types";

/**
 * Event interpretation (AI feature 1).
 * Precedence: explicit per-event override > user-confirmed title mapping >
 * keyword rules > cached LLM result > "needs confirmation".
 * Event titles are UNTRUSTED DATA. They are never executed or concatenated
 * into instructions, and instruction-like titles are forced to confirmation.
 */

const STRONG_WORKOUT: [RegExp, string][] = [
  [/\b(gym|workout|work out|work-out)\b/, "gym"],
  [/\b(crossfit|orangetheory|f45|otf)\b/, "hiit"],
  [/\b(pilates|barre)\b/, "pilates"],
  [/\b(yoga)\b/, "yoga"],
  [/\b(spin|cycling|peloton|indoor ride)\b/, "cycling"],
  [/\b(hiit|bootcamp|boot camp)\b/, "hiit"],
  [/\b(weights|weightlifting|lifting|strength( training)?|leg day|arm day|push day|pull day)\b/, "strength"],
  [/\b(swim|swimming|lap swim)\b/, "swim"],
  [/\b(5k|10k|half marathon|marathon|jog|(morning|evening|long|easy|tempo|lunch) run)\b/, "run"],
  [/\b(climbing|bouldering)\b/, "climbing"],
  [/\b(boxing|kickboxing|muay thai|bjj|jiu jitsu)\b/, "combat"],
  [/\b(rowing|erg)\b/, "rowing"],
  [/\b(tennis|pickleball) (match|practice)\b/, "sport"],
];

/** Plausibly a workout, but often something else ("run of show", "training" at work). */
const WEAK_WORKOUT = /\b(run|class|training|practice|session|pt|lift|ride|game|match|lesson|sweat|club|reformer|lagree|conditioning|cardio|rec|intramural|w\/)\b/;

const NOT_WORKOUT =
  /\b(meeting|standup|stand-up|sync|1:1|one on one|lunch|dinner|breakfast|coffee|interview|review|call|flight|dentist|doctor|appointment|birthday|deadline|webinar|planning|retro|demo|office hours|commute|pickup|pick up|school|conference|presentation|workshop)\b/;

/** Instruction-like text in a title. Matching titles are never auto-trusted. */
const INSTRUCTION_LIKE =
  /(ignore (all |any |the )?(previous|prior|above)|disregard|system prompt|you are now|new instructions?|assistant:|system:|developer:|override|jailbreak|<\/?[a-z][^>]*>|recommend \d+|confidence\s*[:=]?\s*(1|1\.0|100))/i;

export function normalizeTitle(t: string): string {
  return sanitizeUntrustedText(t, 160).toLowerCase();
}

export function looksLikeInstruction(title: string): boolean {
  return INSTRUCTION_LIKE.test(title);
}

export function cacheKeyFor(e: Pick<CalEvent, "title">): string {
  return `${policy.classification.cacheVersion}:${normalizeTitle(e.title)}`;
}

function mk(partial: Omit<Classification, "version">): Classification {
  return { ...partial, version: policy.classification.cacheVersion };
}

/** Keyword layer. Returns null when the title is ambiguous and needs the LLM. */
export function keywordClassify(title: string): Classification | null {
  const t = normalizeTitle(title);
  if (looksLikeInstruction(t)) {
    return mk({
      category: "unclear",
      workoutType: null,
      confidence: 0,
      reason: "Title contains instruction-like text, which is ignored. Confirm what this event is.",
      needsConfirmation: true,
      source: "keyword",
    });
  }
  for (const [re, type] of STRONG_WORKOUT) {
    if (re.test(t)) {
      return mk({
        category: "workout",
        workoutType: type,
        confidence: policy.classification.strongKeywordConfidence,
        reason: `Title matches a ${type} keyword.`,
        needsConfirmation: false,
        source: "keyword",
      });
    }
  }
  if (WEAK_WORKOUT.test(t)) return null;
  if (NOT_WORKOUT.test(t)) {
    return mk({ category: "other", workoutType: null, confidence: 0.9, reason: "Title looks like a non-workout event.", needsConfirmation: false, source: "keyword" });
  }
  return mk({ category: "other", workoutType: null, confidence: 0.75, reason: "No workout keywords found.", needsConfirmation: false, source: "keyword" });
}

/** Turn a classification into how the planner may use it. */
export function toInterpretation(c: Classification, confirmed = false): Interpretation {
  const t = policy.classification;
  if (c.category === "workout") {
    const type = c.workoutType ?? "workout";
    if (confirmed || (!c.needsConfirmation && c.source === "keyword" && c.confidence >= t.autoUseThreshold)) {
      return { kind: "workout", workoutType: type, classification: c, confirmed };
    }
    if (!c.needsConfirmation && c.confidence >= t.llmAutoUseThreshold) {
      return { kind: "workout", workoutType: type, classification: c, confirmed: false };
    }
    if (c.confidence >= t.confirmThreshold) return { kind: "needs_confirmation", classification: c };
    return { kind: "not_workout", classification: c };
  }
  if (c.category === "other" && c.confidence >= t.confirmThreshold && !c.needsConfirmation) return { kind: "not_workout", classification: c };
  return { kind: "needs_confirmation", classification: c };
}

/** Synchronous interpretation used by the planner. Uses only local data and the cache. */
export function interpretEvent(state: Pick<AppState, "eventOverrides" | "titleMappings" | "classificationCache">, e: CalEvent): Interpretation {
  const now = new Date(0).toISOString();
  const ov = state.eventOverrides[e.key];
  if (ov) {
    const c: Classification = {
      category: ov.category,
      workoutType: ov.workoutType,
      confidence: 1,
      reason: "You confirmed this event.",
      needsConfirmation: false,
      source: "user_override",
      version: policy.classification.cacheVersion,
    };
    return ov.category === "workout"
      ? { kind: "workout", workoutType: ov.workoutType ?? "workout", classification: c, confirmed: true }
      : { kind: "not_workout", classification: c };
  }
  const norm = normalizeTitle(e.title);
  const map = state.titleMappings.find((m) => m.title === norm);
  if (map) {
    const c: Classification = {
      category: map.category,
      workoutType: map.workoutType,
      confidence: 1,
      reason: "You told us events with this title are " + (map.category === "workout" ? "workouts." : "not workouts."),
      needsConfirmation: false,
      source: "title_mapping",
      version: policy.classification.cacheVersion,
    };
    void now;
    return map.category === "workout"
      ? { kind: "workout", workoutType: map.workoutType ?? "workout", classification: c, confirmed: true }
      : { kind: "not_workout", classification: c };
  }
  const kw = keywordClassify(e.title);
  if (kw) return toInterpretation(kw);
  const cached = state.classificationCache[cacheKeyFor(e)];
  if (cached) return toInterpretation(cached);
  return {
    kind: "needs_confirmation",
    classification: {
      category: "unclear",
      workoutType: null,
      confidence: 0.5,
      reason: "Title is ambiguous and hasn’t been classified yet.",
      needsConfirmation: true,
      source: "keyword",
      version: policy.classification.cacheVersion,
    },
  };
}

/** Safe fallback for malformed model output: needs confirmation, never auto-used. */
export const MALFORMED_FALLBACK: Omit<Classification, "version" | "source"> = {
  category: "unclear",
  workoutType: null,
  confidence: 0,
  reason: "Couldn’t interpret this title automatically. Confirm what it is.",
  needsConfirmation: true,
};

/**
 * Classify ambiguous events with the LLM (cached by normalized title).
 * Mutates `state.classificationCache`. Returns how many provider calls were made.
 */
export async function classifyPending(state: AppState, ai: AiProvider): Promise<number> {
  let calls = 0;
  const seen = new Set<string>();
  for (const e of activeEvents(state)) {
    if (e.status === "cancelled" || e.allDay) continue;
    if (state.eventOverrides[e.key]) continue;
    const norm = normalizeTitle(e.title);
    if (state.titleMappings.some((m) => m.title === norm)) continue;
    if (keywordClassify(e.title)) continue;
    const key = cacheKeyFor(e);
    if (state.classificationCache[key] || seen.has(key)) continue;
    seen.add(key);
    calls++;
    const start = Date.parse(e.startUtc);
    let result: Classification;
    try {
      const raw = await ai.classifyEvent({
        title: sanitizeUntrustedText(e.title),
        durationMinutes: Math.round((Date.parse(e.endUtc) - start) / 60000),
        weekday: new Date(start).getUTCDay(),
        localHour: localHourOf(start, e.timezone ?? state.prefs.timezone),
      });
      const parsed = ClassificationOutputSchema.safeParse(raw);
      if (!parsed.success) {
        result = { ...MALFORMED_FALLBACK, source: ai.isMock ? "mock_llm" : "llm", version: policy.classification.cacheVersion };
      } else {
        const p = parsed.data;
        result = {
          category: p.category,
          workoutType: p.category === "workout" ? (p.workoutType ?? "workout") : null,
          confidence: p.confidence,
          reason: p.reason,
          needsConfirmation: p.needsConfirmation || p.category === "unclear" || looksLikeInstruction(e.title),
          source: ai.isMock ? "mock_llm" : "llm",
          version: policy.classification.cacheVersion,
        };
      }
    } catch {
      result = { ...MALFORMED_FALLBACK, source: ai.isMock ? "mock_llm" : "llm", version: policy.classification.cacheVersion };
    }
    state.classificationCache[key] = result;
  }
  return calls;
}
