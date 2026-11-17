import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { FLAVORS, type Flavor } from "@/config/products";
import { activeEvents, busyIntervalsForDay, overlaps } from "./busy";
import { dietaryCheck, getProduct } from "./catalog";
import { addDays, dayBounds, formatClock, inQuietHours, isoOf, localDateOf, localMinutesOf, parseHHmm } from "./time";
import type { AppState, LocalDate, Recommendation } from "./types";

/**
 * Deterministic policy engine. Every recommendation, acceptance and manual
 * edit — whether it originated from the planner, the LLM or the user — is
 * validated here, server-side, against the current state.
 */

export interface Violation {
  code:
    | "daily_cap"
    | "unknown_caffeine"
    | "unknown_caffeine_day"
    | "caffeine_ceiling"
    | "past_cutoff"
    | "quiet_hours"
    | "dietary"
    | "no_inventory"
    | "in_past"
    | "bad_flavor";
  message: string;
}
export interface PolicyResult {
  ok: boolean;
  violations: Violation[];
  warnings: string[];
}

export const dateOf = (state: Pick<AppState, "prefs">, iso: string): LocalDate => localDateOf(Date.parse(iso), state.prefs.timezone);

export function drinkCap(state: Pick<AppState, "prefs">, cfg: PolicyConfig = defaultPolicy): number {
  return Math.max(0, Math.min(cfg.maxDrinksPerDay, state.prefs.maxDrinksPerDay));
}

export function stockByFlavor(state: Pick<AppState, "inventory">): Record<Flavor, number> {
  const out = { chai: 0, oolong: 0, matcha: 0 } as Record<Flavor, number>;
  for (const tx of state.inventory) out[tx.flavor] += tx.delta;
  return out;
}

export interface DayTally {
  date: LocalDate;
  completed: number;
  accepted: number;
  proposed: number;
  /** completed + accepted: what counts against the daily cap. */
  counted: number;
  cap: number;
  capReached: boolean;
  consumedMg: number;
  externalMg: number;
  plannedMg: number;
  /** Known tracked caffeine (mg). Never includes unknown amounts as zero. */
  trackedMg: number;
  unknownEntries: number;
  hasUnknown: boolean;
  ceilingMg: number;
}

export function dayTally(state: AppState, date: LocalDate, cfg: PolicyConfig = defaultPolicy): DayTally {
  const consumed = state.consumption.filter((c) => !c.voidedAt && dateOf(state, c.at) === date);
  const external = state.externalCaffeine.filter((c) => !c.voidedAt && dateOf(state, c.at) === date);
  const accepted = state.recommendations.filter((r) => r.status === "accepted" && dateOf(state, r.startUtc) === date);
  const proposed = state.recommendations.filter((r) => r.status === "proposed" && dateOf(state, r.startUtc) === date);
  let unknown = 0;
  const sum = (arr: { mg: number | null }[]) =>
    arr.reduce((s, x) => {
      if (x.mg === null) {
        unknown++;
        return s;
      }
      return s + x.mg;
    }, 0);
  const consumedMg = sum(consumed.map((c) => ({ mg: c.caffeine.mg })));
  const externalMg = sum(external.map((c) => ({ mg: c.mg })));
  const plannedMg = sum(accepted.map((r) => ({ mg: r.caffeine.mg })));
  const cap = drinkCap(state, cfg);
  const counted = consumed.length + accepted.length;
  return {
    date,
    completed: consumed.length,
    accepted: accepted.length,
    proposed: proposed.length,
    counted,
    cap,
    capReached: counted >= cap,
    consumedMg,
    externalMg,
    plannedMg,
    trackedMg: consumedMg + externalMg + plannedMg,
    unknownEntries: unknown,
    hasUnknown: unknown > 0,
    ceilingMg: state.prefs.caffeineCeilingMg,
  };
}

export type ValidateMode = "propose" | "accept" | "edit";

export interface Candidate {
  id?: string;
  flavor: Flavor;
  startUtc: string;
}

export function validateCandidate(
  state: AppState,
  cand: Candidate,
  opts: { mode: ValidateMode; now: Date; cfg?: PolicyConfig },
): PolicyResult {
  const cfg = opts.cfg ?? defaultPolicy;
  const violations: Violation[] = [];
  const warnings: string[] = [];
  const tz = state.prefs.timezone;
  const startMs = Date.parse(cand.startUtc);

  if (!FLAVORS.includes(cand.flavor)) {
    return { ok: false, violations: [{ code: "bad_flavor", message: "Unknown flavor." }], warnings };
  }
  if (!Number.isFinite(startMs)) return { ok: false, violations: [{ code: "in_past", message: "Invalid time." }], warnings };
  if (startMs < opts.now.getTime() - 60_000) violations.push({ code: "in_past", message: "That time has already passed." });

  const date = localDateOf(startMs, tz);
  const others = state.recommendations.filter((r) => r.id !== cand.id);
  const reserveStatuses: Recommendation["status"][] = opts.mode === "propose" ? ["accepted", "proposed"] : ["accepted"];
  const completedToday = state.consumption.filter((c) => !c.voidedAt && dateOf(state, c.at) === date).length;
  const reservedToday = others.filter((r) => reserveStatuses.includes(r.status) && dateOf(state, r.startUtc) === date);

  // Daily cap: completed + accepted (+ proposed when planning) + this one.
  const cap = drinkCap(state, cfg);
  if (completedToday + reservedToday.length + 1 > cap) {
    violations.push({
      code: "daily_cap",
      message: `That would exceed your limit of ${cap} drink${cap === 1 ? "" : "s"} for ${date}. The cap is a ceiling, not a goal.`,
    });
  }

  // Caffeine: unknown is never zero.
  const product = getProduct(state, cand.flavor);
  if (product.caffeine.mg === null) {
    violations.push({
      code: "unknown_caffeine",
      message: `Caffeine for ${product.name} isn’t established, so it can’t be checked against your ceiling.`,
    });
  } else {
    const tally = dayTally(state, date, cfg);
    const reservedMg = reservedToday
      .filter((r) => r.status === "proposed")
      .reduce((s, r) => s + (r.caffeine.mg ?? 0), 0);
    const reservedUnknown = reservedToday.some((r) => r.caffeine.mg === null);
    if (tally.hasUnknown || reservedUnknown) {
      violations.push({
        code: "unknown_caffeine_day",
        message: "Something logged or planned today has unknown caffeine, so today’s total can’t be verified.",
      });
    } else if (tally.trackedMg + reservedMg + product.caffeine.mg > state.prefs.caffeineCeilingMg) {
      violations.push({
        code: "caffeine_ceiling",
        message: `Tracked caffeine would pass your ${state.prefs.caffeineCeilingMg} mg ceiling.`,
      });
    }
  }

  if (localMinutesOf(startMs, tz) > parseHHmm(state.prefs.caffeineCutoff)) {
    violations.push({ code: "past_cutoff", message: `That is after your caffeine cutoff (${formatClock(state.prefs.caffeineCutoff)}).` });
  }
  if (inQuietHours(startMs, tz, state.prefs.quietHours)) {
    violations.push({ code: "quiet_hours", message: "That falls inside your quiet hours." });
  }
  const diet = dietaryCheck(state.prefs, product);
  if (!diet.ok) violations.push({ code: "dietary", message: diet.message });

  // Inventory: stock minus cans already reserved by other pending suggestions.
  const stock = stockByFlavor(state)[cand.flavor];
  const reservedCans = others.filter((r) => reserveStatuses.includes(r.status) && r.flavor === cand.flavor && Date.parse(r.startUtc) >= opts.now.getTime()).length;
  if (stock - reservedCans < 1) {
    violations.push({ code: "no_inventory", message: `Not enough ${product.name} cans in stock (${stock} logged).` });
  }

  // Soft: overlapping a calendar event.
  const busy = busyIntervalsForDay(activeEvents(state), date, tz);
  if (overlaps({ startMs, endMs: startMs + cfg.timing.drinkWindowMinutes * 60_000 }, busy)) {
    warnings.push("This time overlaps a calendar event.");
  }

  return { ok: violations.length === 0, violations, warnings };
}

export function dayWindow(date: LocalDate, tz: string) {
  const { startMs, endMs } = dayBounds(date, tz);
  return { startMs, endMs, startIso: isoOf(startMs), endIso: isoOf(endMs), nextDate: addDays(date, 1) };
}
