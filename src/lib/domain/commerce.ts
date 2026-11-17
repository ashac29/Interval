import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { FLAVORS, OFFERS, type Flavor, type OfferId } from "@/config/products";
import type { ActionResult } from "./actions";
import { recompute } from "./engine";
import { recordFeedback } from "./feedback";
import { newId } from "./ids";
import { addDays, diffDays, localDateOf } from "./time";
import { stockByFlavor } from "./validate";
import type { AppState, LocalDate, SimOrder, SimShipment } from "./types";

/**
 * Simulated commerce. Nothing here collects payment, ships product or
 * charges anyone. Every shipment change is an explicit user action;
 * nothing is modified silently.
 */

type Mix = Record<Flavor, number>;
const zeroMix = (): Mix => ({ chai: 0, oolong: 0, matcha: 0 });
const mixTotal = (m: Mix) => FLAVORS.reduce((s, f) => s + (m[f] ?? 0), 0);

export function validateMix(mix: Mix, cans: number): string | null {
  for (const f of FLAVORS) {
    if (!Number.isInteger(mix[f]) || mix[f] < 0) return "Quantities must be whole numbers, 0 or more.";
  }
  if (mixTotal(mix) !== cans) return `Pick exactly ${cans} cans (you have ${mixTotal(mix)}).`;
  return null;
}

export function addMonths(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

const today = (state: AppState, now: Date) => localDateOf(now.getTime(), state.prefs.timezone);

export function nextShipment(state: AppState): SimShipment | null {
  if (state.subscription.status !== "active") return null;
  return [...state.subscription.shipments].filter((s) => s.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

function ensureNextScheduled(state: AppState, from: LocalDate) {
  if (state.subscription.status !== "active") return;
  if (state.subscription.shipments.some((s) => s.status === "scheduled")) return;
  state.subscription.shipments.push({ id: newId("shp"), date: addMonths(from, 1), status: "scheduled", mix: { ...state.subscription.mix } });
}

/* ───────────── Checkout ───────────── */

export interface CheckoutInput {
  offer: OfferId;
  mix: Mix;
  name: string;
  city: string;
}

export function placeOrder(state: AppState, input: CheckoutInput, now: Date): ActionResult<{ orderId: string; number: string }> {
  const offer = OFFERS[input.offer];
  if (!offer) return { ok: false, error: "Unknown offer." };
  const err = validateMix(input.mix, offer.cans);
  if (err) return { ok: false, error: err };
  const name = input.name.trim().slice(0, 60);
  const city = input.city.trim().slice(0, 60);
  if (!name || !city) return { ok: false, error: "Add a name and city for the simulated shipping address." };
  if (input.offer === "subscription" && state.subscription.status !== "none") {
    return { ok: false, error: "You already have a subscription. Manage it in Supply — no second one was created." };
  }
  const t = today(state, now);
  const order: SimOrder = {
    id: newId("ord"),
    number: `INT-SIM-${Math.floor(100000 + (Date.parse(now.toISOString()) % 900000))}`,
    offer: input.offer,
    cans: offer.cans,
    priceCents: offer.priceCents,
    mix: { ...input.mix },
    placedAt: now.toISOString(),
    shipTo: { name, city },
    status: "placed",
    simulated: true,
  };
  state.orders.unshift(order);
  if (input.offer === "subscription") {
    state.subscription = {
      status: "active",
      cadence: "monthly",
      cans: offer.cans,
      priceCents: offer.priceCents,
      mix: { ...input.mix },
      shipments: [
        { id: newId("shp"), date: addDays(t, 3), status: "scheduled", mix: { ...input.mix }, note: `Order ${order.number}` },
        { id: newId("shp"), date: addMonths(addDays(t, 3), 1), status: "scheduled", mix: { ...input.mix } },
      ],
      updatedAt: now.toISOString(),
    };
  }
  return { ok: true, message: "Simulated order placed. No payment was collected.", orderId: order.id, number: order.number };
}

/** Trial boxes: user confirms the simulated delivery to add cans to logged stock. */
export function confirmOrderDelivered(state: AppState, orderId: string, now: Date): ActionResult {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return { ok: false, error: "Order not found." };
  if (o.offer !== "trial") return { ok: false, error: "Subscription boxes are confirmed from their shipment." };
  if (o.status === "delivered") return { ok: true, message: "Already confirmed." };
  o.status = "delivered";
  for (const f of FLAVORS) {
    if (o.mix[f] > 0) state.inventory.push({ id: newId("inv"), flavor: f, delta: o.mix[f], reason: "order", basis: "logged", at: now.toISOString(), ref: o.id });
  }
  recompute(state, now, { trigger: "delivery" });
  return { ok: true, message: "Delivery confirmed (simulated). Cans added to your stock." };
}

/* ───────────── Subscription ───────────── */

export function pauseSubscription(state: AppState, now: Date): ActionResult {
  if (state.subscription.status !== "active") return { ok: false, error: "There’s no active subscription to pause." };
  state.subscription.status = "paused";
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: "Paused. No shipments are scheduled while paused (simulated)." };
}

export function resumeSubscription(state: AppState, firstDate: LocalDate | null, now: Date): ActionResult {
  if (state.subscription.status !== "paused") return { ok: false, error: "The subscription isn’t paused." };
  const t = today(state, now);
  const date = firstDate ?? addDays(t, 7);
  if (diffDays(t, date) < 1) return { ok: false, error: "Pick a date after today." };
  state.subscription.status = "active";
  state.subscription.shipments = state.subscription.shipments.map((s) => (s.status === "scheduled" ? { ...s, status: "skipped" as const, note: "Skipped while paused" } : s));
  state.subscription.shipments.push({ id: newId("shp"), date, status: "scheduled", mix: { ...state.subscription.mix } });
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: `Resumed. Next simulated shipment: ${date}.` };
}

export function skipNextShipment(state: AppState, now: Date): ActionResult {
  const s = nextShipment(state);
  if (!s) return { ok: false, error: "No upcoming shipment to skip." };
  s.status = "skipped";
  s.note = "Skipped by you";
  state.subscription.shipments.push({ id: newId("shp"), date: addMonths(s.date, 1), status: "scheduled", mix: { ...state.subscription.mix } });
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: `Skipped the ${s.date} shipment. Next: ${addMonths(s.date, 1)}.` };
}

export function advanceShipment(state: AppState, date: LocalDate, now: Date, cfg: PolicyConfig = defaultPolicy): ActionResult {
  const s = nextShipment(state);
  if (!s) return { ok: false, error: "No upcoming shipment." };
  const t = today(state, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a valid date." };
  if (diffDays(t, date) < cfg.subscription.advanceMinDaysFromToday) return { ok: false, error: "Choose a date after today." };
  if (diffDays(date, s.date) <= 0) return { ok: false, error: "To move it later, use delay." };
  s.date = date;
  s.note = "Moved earlier by you";
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: `Shipment moved up to ${date} (simulated).` };
}

export function delayShipment(state: AppState, days: number, now: Date, cfg: PolicyConfig = defaultPolicy): ActionResult {
  const s = nextShipment(state);
  if (!s) return { ok: false, error: "No upcoming shipment." };
  if (!(cfg.subscription.delayChoicesDays as readonly number[]).includes(days)) return { ok: false, error: "Choose one of the listed delays." };
  s.date = addDays(s.date, days);
  s.note = `Delayed ${days} days by you`;
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: `Shipment delayed to ${s.date} (simulated).` };
}

export function updateSubscriptionMix(state: AppState, mix: Mix, now: Date): ActionResult {
  if (state.subscription.status === "none") return { ok: false, error: "No subscription." };
  const err = validateMix(mix, state.subscription.cans);
  if (err) return { ok: false, error: err };
  state.subscription.mix = { ...mix };
  for (const s of state.subscription.shipments) if (s.status === "scheduled") s.mix = { ...mix };
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: "Mix updated for upcoming shipments." };
}

export function cancelSubscription(state: AppState, now: Date): ActionResult {
  if (state.subscription.status === "none") return { ok: false, error: "No subscription." };
  state.subscription.status = "none";
  for (const s of state.subscription.shipments) if (s.status === "scheduled") s.status = "skipped";
  state.subscription.updatedAt = now.toISOString();
  return { ok: true, message: "Subscription cancelled (simulated). No further shipments." };
}

/** Marks a simulated shipment delivered by user confirmation and adds its cans to logged stock. */
export function confirmShipmentDelivered(state: AppState, shipmentId: string, now: Date): ActionResult {
  const s = state.subscription.shipments.find((x) => x.id === shipmentId);
  if (!s) return { ok: false, error: "Shipment not found." };
  if (s.status === "delivered") return { ok: true, message: "Already confirmed." };
  if (s.status !== "scheduled") return { ok: false, error: "That shipment was skipped." };
  s.status = "delivered";
  for (const f of FLAVORS) {
    if (s.mix[f] > 0) state.inventory.push({ id: newId("inv"), flavor: f, delta: s.mix[f], reason: "shipment", basis: "logged", at: now.toISOString(), ref: s.id });
  }
  ensureNextScheduled(state, s.date);
  recompute(state, now, { trigger: "delivery" });
  return { ok: true, message: "Delivery confirmed (simulated). Cans added to your logged stock." };
}

/* ───────────── Replenishment (suggestions only; always confirmed) ───────────── */

export interface ReplenishmentSuggestion {
  id: string;
  kind: "advance" | "delay";
  title: string;
  detail: string;
  date?: LocalDate;
  days?: number;
}

export function consumptionRate(state: AppState, now: Date, cfg: PolicyConfig = defaultPolicy): { perDay: number; spanDays: number; total: number } {
  const t = today(state, now);
  const from = addDays(t, -cfg.replenishment.lookbackDays);
  const mine = state.consumption.filter((c) => !c.voidedAt).map((c) => ({ ...c, d: localDateOf(Date.parse(c.at), state.prefs.timezone) })).filter((c) => c.d >= from && c.d <= t);
  if (mine.length === 0) return { perDay: 0, spanDays: 0, total: 0 };
  const first = mine.map((c) => c.d).sort()[0]!;
  const span = Math.max(1, diffDays(first, t) + 1);
  return { perDay: mine.length / span, spanDays: span, total: mine.length };
}

export function replenishmentSuggestions(state: AppState, now: Date, cfg: PolicyConfig = defaultPolicy): ReplenishmentSuggestion[] {
  const r = cfg.replenishment;
  const ship = nextShipment(state);
  if (!ship) return [];
  const { perDay, spanDays } = consumptionRate(state, now, cfg);
  if (spanDays < r.minLoggedDays || perDay <= 0) return [];
  const stock = Object.values(stockByFlavor(state)).reduce((a, b) => a + b, 0);
  const runway = stock / perDay;
  const t = today(state, now);
  const untilShip = diffDays(t, ship.date);
  const suggestions: ReplenishmentSuggestion[] = [];
  const dismissed = new Set(state.replenishment.filter((d) => !d.accepted && Date.parse(d.at) > now.getTime() - 7 * 86_400_000).map((d) => d.action));
  if (runway + r.runwayBufferDays < untilShip) {
    const target = addDays(t, Math.max(cfg.subscription.advanceMinDaysFromToday, Math.floor(runway - r.runwayBufferDays)));
    if (diffDays(target, ship.date) > 0) {
      const id = `advance:${target}`;
      if (!dismissed.has(id))
        suggestions.push({
          id,
          kind: "advance",
          date: target,
          title: `Move your next shipment up to ${target}?`,
          detail: `Based on what you’ve logged (about ${perDay.toFixed(1)} cans/day) your ${stock} cans may last roughly ${Math.max(0, Math.round(runway))} days, but your next shipment is in ${untilShip}. Estimate only — nothing changes unless you confirm.`,
        });
    }
  } else if (runway > untilShip + r.surplusDays) {
    const id = "delay:14";
    if (!dismissed.has(id))
      suggestions.push({
        id,
        kind: "delay",
        days: 14,
        title: "Delay your next shipment by 14 days?",
        detail: `You have about ${Math.round(runway)} days of cans at your logged pace, well past your next shipment in ${untilShip} days. Estimate only — nothing changes unless you confirm.`,
      });
  }
  return suggestions;
}

export function acceptReplenishment(state: AppState, suggestionId: string, now: Date): ActionResult {
  const s = replenishmentSuggestions(state, now).find((x) => x.id === suggestionId);
  if (!s) return { ok: false, error: "That suggestion is out of date. Refresh and look again." };
  const res = s.kind === "advance" ? advanceShipment(state, s.date as LocalDate, now) : delayShipment(state, s.days as number, now);
  if (!res.ok) return res;
  state.replenishment.push({ id: newId("rep"), at: now.toISOString(), action: s.id, accepted: true });
  recordFeedback(state, "replenishment_accepted", { kind: s.kind }, now);
  return res;
}

export function dismissReplenishment(state: AppState, suggestionId: string, now: Date): ActionResult {
  state.replenishment.push({ id: newId("rep"), at: now.toISOString(), action: suggestionId, accepted: false });
  recordFeedback(state, "replenishment_dismissed", { id: suggestionId.split(":")[0] ?? "" }, now);
  return { ok: true, message: "Okay, we’ll leave your shipments alone." };
}

export { zeroMix, mixTotal };
