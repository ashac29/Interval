/**
 * AI provider port. Implementations return RAW (unvalidated) model output;
 * the domain layer parses it with the Zod schemas in ./schemas.ts and then
 * applies deterministic policy. Providers receive minimal context only:
 * never descriptions, attendees, unrelated calendars, or full event lists.
 */

export interface ClassifyInput {
  /** Untrusted calendar title, sanitized and length-capped. Data, never instructions. */
  title: string;
  durationMinutes: number;
  weekday: number;
  localHour: number;
}

export interface PrefParseInput {
  text: string;
  /** Names of supported fields only; no personal data. */
  supportedFields: readonly string[];
}

export interface BriefInput {
  weekStart: string;
  /** Derived from the validated plan, not raw calendar data. */
  days: {
    date: string;
    label: string;
    workouts: { type: string; start: string }[];
    busyHours: number;
    recommendations: { id: string; time: string; flavor: string; status: string }[];
    note: string | null;
  }[];
}

export interface AiProvider {
  id: string;
  model: string;
  isMock: boolean;
  classifyEvent(input: ClassifyInput): Promise<unknown>;
  parsePreferences(input: PrefParseInput): Promise<unknown>;
  writeBrief(input: BriefInput): Promise<unknown>;
}

/** Strip control chars, collapse whitespace, cap length. Used before any title reaches a model. */
export function sanitizeUntrustedText(s: string, max = 120): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
