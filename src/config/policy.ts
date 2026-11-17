/**
 * CUSTOMIZABLE DECISIONS — policy, thresholds, weights, sync & AI defaults.
 * Everything an operator may reasonably tune lives in this file (or in
 * `products.ts` / `src/app/tokens.css`). Values are plain data so tests can
 * override them via the `config` argument accepted by the domain functions.
 */

export const POLICY_VERSION = "policy-2026.11.1";
export const SCORING_VERSION = "score-2026.11.1";

export const policy = {
  /** Hard product cap. A cap, never a target. Users may only lower it. */
  maxDrinksPerDay: 2,

  /** Caffeine guidance. General-population context only, not a target. */
  caffeine: {
    defaultCeilingMg: 400,
    /** Users may choose any ceiling in [min, defaultCeilingMg]. */
    minCeilingMg: 50,
    guidance: {
      label: "American Heart Association — Caffeine and Cardiovascular Disease (2026)",
      url: "https://www.heart.org/",
      summary:
        "Describes up to 400 mg/day as generally safe for most adults, with evidence primarily about coffee.",
      /** Operators: replace `url` with the exact guidance page before launch. */
      urlNeedsVerification: true,
    },
  },

  /** Busy-day detection. */
  busyDay: { occupiedHoursThreshold: 4 },

  /** Candidate generation offsets / gaps (minutes). */
  timing: {
    drinkWindowMinutes: 15,
    afterWorkoutOffsets: [20, 30, 45, 60, 75, 90],
    beforeWorkoutOffsets: [60, 45, 75, 90],
    minFreeGapMinutes: 25,
    busyGapEarliest: "08:00",
    expireGraceMinutes: 90,
    maxPlanningDaysAhead: 7,
    /** The engine proposes ONE drink per day by default, two only when two usable workouts exist. Always <= the cap. */
    proposalsPerDay: 1,
    proposalsPerDayWithTwoWorkouts: 2,
    minSpacingMinutes: 120,
    /** After a workout, "limited free time" means fewer free hours than this until end of day window. */
    limitedFreeHoursAfter: 3,
  },

  quietHoursDefault: { start: "22:00", end: "07:00" },
  caffeineCutoffDefault: "15:00",

  /** Event classification. */
  classification: {
    strongKeywordConfidence: 0.95,
    weakKeywordConfidence: 0.6,
    /** At/above: used automatically. Between: needs user confirmation. Below: not a workout. */
    autoUseThreshold: 0.85,
    confirmThreshold: 0.5,
    /** LLM-sourced results above this still need confirmation unless the keyword layer agrees. */
    llmAutoUseThreshold: 0.9,
    cacheVersion: "cls-v1",
  },

  /** Scoring weights for the inspectable ranking function (see domain/score.ts). */
  scoring: {
    base: 50,
    confirmedWorkout: 18,
    limitedFreeTimeAfter: 10,
    busyDay: 6,
    timingPrefMatch: 12,
    timingPrefEither: 4,
    flavorPreferenceTop: 6,
    flavorPreferenceOther: 3,
    gapComfortPerHour: 3,
    gapComfortMax: 9,
    /** Learned (inferred) adaptation is capped so it can never beat explicit prefs. */
    learnedTimeMax: 8,
    learnedFlavorMax: 5,
    /** Observations needed before inferred behavior has any weight (no one-off overfitting). */
    learnedMinObservations: 3,
    learnedShrinkageK: 4,
    varietyPenalty: 4,
  },

  /** Replenishment. */
  replenishment: {
    lookbackDays: 14,
    minLoggedDays: 5,
    runwayBufferDays: 4,
    surplusDays: 21,
  },

  reminders: {
    defaultLeadMinutes: 15,
    maxAttempts: 4,
    backoffMinutes: [1, 5, 20],
  },

  subscription: {
    advanceMinDaysFromToday: 1,
    delayChoicesDays: [7, 14, 30],
  },

  retention: {
    /** Imported calendar window (days). Events outside it are deleted on every sync. */
    calendarPastDays: 7,
    calendarFutureDays: 14,
    feedbackMaxEvents: 3000,
  },
} as const;

export type PolicyConfig = typeof policy;

/** Calendar sync (CUSTOMIZABLE). Env overrides are read in `lib/env.ts`. */
export const syncDefaults = {
  intervalMinutes: 60,
  pastDays: policy.retention.calendarPastDays,
  futureDays: policy.retention.calendarFutureDays,
  pageSize: 250,
  /** Minimal scopes: calendar list + events, read-only. */
  scopes: [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ],
};

/** AI defaults (CUSTOMIZABLE). Provider/model chosen via env, see lib/env.ts. */
export const aiDefaults = {
  provider: "anthropic" as const,
  model: "claude-sonnet-5-5",
  maxTokens: 1024,
  timeoutMs: 15000,
  promptVersion: "prompts-2026.11.1",
};
