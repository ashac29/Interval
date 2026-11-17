import { policy as defaultPolicy, SCORING_VERSION, type PolicyConfig } from "@/config/policy";
import type { Flavor } from "@/config/products";
import type { Learned } from "./learning";
import { weekdayOf } from "./time";
import type { Preferences, RecKind, ScoreBreakdown, LocalDate } from "./types";

/**
 * Inspectable ranking function (AI feature 2). Application code generates the
 * eligible candidate slots; this function only ranks them. Every term is
 * recorded in the breakdown together with SCORING_VERSION so any suggestion
 * can be explained ("Why this suggestion?").
 */

export interface ScoreInput {
  kind: RecKind;
  date: LocalDate;
  flavor: Flavor;
  prefs: Preferences;
  workoutUsable: boolean;
  workoutType: string | null;
  limitedFreeAfter: boolean;
  busyDay: boolean;
  gapMinutes: number;
  offsetMin: number;
  sameFlavorAlreadyToday: boolean;
  learned: Learned;
}

export function scoreCandidate(i: ScoreInput, cfg: PolicyConfig = defaultPolicy): ScoreBreakdown {
  const w = cfg.scoring;
  const parts: ScoreBreakdown["parts"] = [];
  const add = (code: string, value: number, label: string) => {
    if (value !== 0) parts.push({ code, value: Math.round(value * 10) / 10, label });
  };
  add("base", w.base, "Base");
  if (i.kind !== "busy_gap" && i.workoutUsable) add("confirmed_workout", w.confirmedWorkout, "Workout on your calendar");
  if (i.kind === "post_workout" && i.limitedFreeAfter) add("limited_free_after", w.limitedFreeTimeAfter, "Little free time after your workout");
  if (i.busyDay) add("busy_day", w.busyDay, "Busy day");

  if (i.prefs.timing === "either") add("timing_either", w.timingPrefEither, "No before/after preference");
  else if ((i.prefs.timing === "after" && i.kind === "post_workout") || (i.prefs.timing === "before" && i.kind === "pre_workout"))
    add("timing_pref", w.timingPrefMatch, `Matches your "${i.prefs.timing} workout" preference`);

  const rankIdx = i.prefs.flavorRank.indexOf(i.flavor);
  if (rankIdx === 0) add("flavor_top", w.flavorPreferenceTop, "Your top flavor");
  else if (rankIdx > 0) add("flavor_pref", w.flavorPreferenceOther, "One of your preferred flavors");

  const wd = weekdayOf(i.date);
  const officeFlavor = i.prefs.flavorByDayType.office;
  if (officeFlavor && i.prefs.officeDays?.includes(wd) && officeFlavor === i.flavor) {
    add("office_flavor", w.flavorPreferenceTop + 4, "Your flavor choice for office days");
  }

  add("gap_comfort", Math.min(w.gapComfortMax, (i.gapMinutes / 60) * w.gapComfortPerHour), "Comfortable gap");
  if (i.sameFlavorAlreadyToday) add("variety", -w.varietyPenalty, "Same flavor as another drink today");

  const t = i.learned.timeBoost(i.kind, i.offsetMin);
  add("learned_time", t.value, `Learned from ${t.n} past timing choices (inferred)`);
  const f = i.learned.flavorBoost(i.flavor);
  add("learned_flavor", f.value, `Learned from ${f.n} past flavor choices (inferred)`);

  const total = Math.round(parts.reduce((s, p) => s + p.value, 0) * 10) / 10;
  void SCORING_VERSION;
  return { total, parts };
}
