import type { PrefsValues } from "@/components/app/prefs-editor";
import type { AppState } from "@/lib/domain/types";

export function prefsValues(state: AppState): PrefsValues {
  const p = state.prefs;
  return {
    flavorRank: p.flavorRank,
    timing: p.timing,
    busyDaySuggestions: p.busyDaySuggestions,
    remindersInApp: p.reminders.inApp,
    remindersEmail: p.reminders.email,
    emailAddress: p.reminders.emailAddress ?? "",
    leadMinutes: p.reminders.leadMinutes,
    quietStart: p.quietHours.start,
    quietEnd: p.quietHours.end,
    caffeineCeilingMg: p.caffeineCeilingMg,
    caffeineCutoff: p.caffeineCutoff,
    dietary: p.dietary,
    timezone: p.timezone,
    maxDrinksPerDay: p.maxDrinksPerDay,
  };
}
