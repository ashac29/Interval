import { syncDefaults } from "@/config/policy";
import { defaultPreferences } from "./prefs";
import { STATE_SCHEMA, type AppState } from "./types";

export function createInitialState(opts: { mode: "demo" | "live"; timezone: string; displayName?: string; now: Date; email?: string | null }): AppState {
  const nowIso = opts.now.toISOString();
  const prefs = defaultPreferences(opts.timezone);
  if (opts.email) prefs.reminders.emailAddress = opts.email;
  return {
    schema: STATE_SCHEMA,
    mode: opts.mode,
    scenario: null,
    demoNowIso: null,
    caffeineOverrides: {},
    profile: { displayName: opts.displayName ?? "", onboarded: false, createdAt: nowIso },
    prefs,
    calendar: {
      status: "not_connected",
      provider: null,
      isDemo: false,
      calendars: [],
      lastSyncAt: null,
      lastSyncSummary: null,
      lastError: null,
      nextSyncAt: null,
      syncIntervalMinutes: syncDefaults.intervalMinutes,
      scopes: [],
    },
    events: [],
    classificationCache: {},
    titleMappings: [],
    eventOverrides: {},
    recommendations: [],
    planRuns: [],
    feedback: [],
    consumption: [],
    externalCaffeine: [],
    inventory: [],
    stockCorrectedAt: {},
    subscription: { status: "none", cadence: "monthly", cans: 24, priceCents: 7200, mix: { chai: 8, oolong: 8, matcha: 8 }, shipments: [], updatedAt: null },
    orders: [],
    reminders: [],
    notices: [],
    emailPreviews: [],
    prefChanges: [],
    pendingPref: null,
    replenishment: [],
    briefs: [],
    nextJobAt: null,
    version: 0,
  };
}

/** The clock for a state: frozen simulated clock in demo mode, real clock in live mode. */
export function clockFor(state: Pick<AppState, "mode" | "demoNowIso">, real: Date = new Date()): Date {
  return state.mode === "demo" && state.demoNowIso ? new Date(state.demoNowIso) : real;
}
