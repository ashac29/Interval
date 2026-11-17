import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import type { Flavor } from "@/config/products";
import type { AppState, FeedbackEvent, RecKind } from "./types";

/**
 * Lightweight per-user adaptation derived from the append-only feedback log.
 * No model training. Principles (see README "Feedback loop"):
 *  - acceptance is not consumption; silence is not rejection (no event, no effect)
 *  - explicit corrections (reschedule, flavor change) outweigh passive signals
 *  - "didn't work out" never changes timing
 *  - compensated (undone) events are ignored
 *  - shrinkage + minimum observations stop one action from overfitting
 *  - output is capped and can never override an explicit preference
 */

const W = {
  accepted: 1,
  completed: 1.5,
  rescheduledTo: 3,
  dismissWrongTime: -1.5,
  flavorChangedTo: 3,
  flavorChangedFrom: -1,
  dismissWrongFlavor: -2,
  acceptedFlavor: 0.5,
};

export interface Obs {
  w: number;
  kind: RecKind;
  offsetMin: number;
}

export interface Learned {
  observations: number;
  /** Inferred time adjustment in [-learnedTimeMax, +learnedTimeMax]. */
  timeBoost(kind: RecKind, offsetMin: number): { value: number; n: number };
  flavorBoost(flavor: Flavor): { value: number; n: number };
}

function activeEvents(events: FeedbackEvent[]): FeedbackEvent[] {
  const compensated = new Set(events.filter((e) => e.compensates).map((e) => e.compensates as string));
  return events.filter((e) => !compensated.has(e.id) && !e.compensates);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function deriveLearning(state: Pick<AppState, "feedback">, cfg: PolicyConfig = defaultPolicy): Learned {
  const s = cfg.scoring;
  const evs = activeEvents(state.feedback);
  const timeObs: Obs[] = [];
  const flavorObs: { w: number; flavor: Flavor }[] = [];

  for (const e of evs) {
    const kind = e.data.kind as RecKind | undefined;
    const off = num(e.data.offsetMin);
    switch (e.type) {
      case "rec_accepted":
        if (kind && off !== null) timeObs.push({ w: W.accepted, kind, offsetMin: off });
        if (e.data.flavor) flavorObs.push({ w: W.acceptedFlavor, flavor: e.data.flavor as Flavor });
        break;
      case "rec_completed":
        if (kind && off !== null) timeObs.push({ w: W.completed, kind, offsetMin: off });
        if (e.data.flavor) flavorObs.push({ w: 1, flavor: e.data.flavor as Flavor });
        break;
      case "rec_rescheduled":
        if (kind && off !== null) timeObs.push({ w: W.rescheduledTo, kind, offsetMin: off });
        break;
      case "rec_flavor_changed":
        if (e.data.to) flavorObs.push({ w: W.flavorChangedTo, flavor: e.data.to as Flavor });
        if (e.data.from) flavorObs.push({ w: W.flavorChangedFrom, flavor: e.data.from as Flavor });
        break;
      case "rec_dismissed": {
        const reason = e.data.reason;
        if (reason === "wrong_time" && kind && off !== null) timeObs.push({ w: W.dismissWrongTime, kind, offsetMin: off });
        if (reason === "wrong_flavor" && e.data.flavor) flavorObs.push({ w: W.dismissWrongFlavor, flavor: e.data.flavor as Flavor });
        // didnt_work_out / already_had / too_many_reminders / other: deliberately no timing or flavor effect.
        break;
      }
      default:
        break;
    }
  }

  return {
    observations: timeObs.length + flavorObs.length,
    timeBoost(kind, offsetMin) {
      const mine = timeObs.filter((o) => o.kind === kind);
      if (mine.length < s.learnedMinObservations) return { value: 0, n: mine.length };
      let signed = 0;
      let total = 0;
      for (const o of mine) {
        const d = Math.abs(o.offsetMin - offsetMin);
        const kernel = Math.max(0, 1 - d / 30);
        signed += o.w * kernel;
        total += Math.abs(o.w);
      }
      const v = signed / (total + s.learnedShrinkageK);
      return { value: Math.max(-1, Math.min(1, v)) * s.learnedTimeMax, n: mine.length };
    },
    flavorBoost(flavor) {
      if (flavorObs.length < s.learnedMinObservations) return { value: 0, n: flavorObs.length };
      let signed = 0;
      let total = 0;
      for (const o of flavorObs) {
        if (o.flavor === flavor) signed += o.w;
        total += Math.abs(o.w);
      }
      const v = signed / (total + s.learnedShrinkageK);
      return { value: Math.max(-1, Math.min(1, v)) * s.learnedFlavorMax, n: flavorObs.length };
    },
  };
}
