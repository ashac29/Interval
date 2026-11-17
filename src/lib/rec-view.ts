import { FLAVORS } from "@/config/products";
import { getProduct } from "@/lib/domain/catalog";
import { localMinutesOf, minutesToHHmm, formatTime } from "@/lib/domain/time";
import { stockByFlavor, validateCandidate } from "@/lib/domain/validate";
import type { AppState, Recommendation } from "@/lib/domain/types";
import type { FlavorOption, RecLite } from "@/components/app/rec-controls";

export function recLite(state: AppState, r: Recommendation): RecLite {
  return {
    id: r.id,
    status: r.status === "accepted" ? "accepted" : "proposed",
    flavor: r.flavor,
    date: r.localDate,
    hhmm: minutesToHHmm(localMinutesOf(Date.parse(r.startUtc), state.prefs.timezone)),
    hasConflict: Boolean(r.conflict),
  };
}

export function flavorOptions(state: AppState, r: Recommendation, now: Date): FlavorOption[] {
  const stock = stockByFlavor(state);
  return FLAVORS.map((flavor) => {
    const v = validateCandidate(state, { id: r.id, flavor, startUtc: r.startUtc }, { mode: "edit", now });
    const hard = v.violations.find((x) => x.code !== "in_past");
    const short =
      hard?.code === "unknown_caffeine" ? "Caffeine not established" : hard?.code === "no_inventory" ? "Out of stock" : hard?.code === "caffeine_ceiling" ? "Over caffeine ceiling" : hard?.code === "dietary" ? "Dietary check" : hard ? "Not allowed" : null;
    return { flavor, name: getProduct(state, flavor).name, stock: stock[flavor], blocked: short };
  });
}

export const timeLabel = (state: AppState, r: Pick<Recommendation, "startUtc">) => formatTime(Date.parse(r.startUtc), state.prefs.timezone);
