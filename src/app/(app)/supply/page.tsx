import type { Metadata } from "next";
import Link from "next/link";
import { ReplenishCard, ConfirmDeliveryButton, StockEditor, SubscriptionControls } from "@/components/app/supply-controls";
import { UndoLogButton } from "@/components/app/log-dialogs";
import { Can } from "@/components/brand/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/callout";
import { policy } from "@/config/policy";
import { FLAVORS, money, type Flavor } from "@/config/products";
import { getProduct } from "@/lib/domain/catalog";
import { consumptionRate, nextShipment, replenishmentSuggestions } from "@/lib/domain/commerce";
import { addDays, formatDayLong, formatDayShort, formatTime, localDateOf } from "@/lib/domain/time";
import { stockByFlavor } from "@/lib/domain/validate";
import { pageData } from "@/lib/session";

export const metadata: Metadata = { title: "Supply" };

export default async function SupplyPage() {
  const { state, now } = await pageData();
  const tz = state.prefs.timezone;
  const stock = stockByFlavor(state);
  const total = Object.values(stock).reduce((a, b) => a + b, 0);
  const sug = replenishmentSuggestions(state, now);
  const sub = state.subscription;
  const next = nextShipment(state);
  const today = localDateOf(now.getTime(), tz);
  const rate = consumptionRate(state, now);
  const history = state.consumption.filter((c) => !c.voidedAt).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 14);
  const pendingTrials = state.orders.filter((o) => o.offer === "trial" && o.status === "placed");
  const ship = sub.shipments.filter((s) => s.status !== "delivered").sort((a, b) => a.date.localeCompare(b.date));
  const basis = (f: Flavor) => (state.stockCorrectedAt[f] || state.inventory.some((t) => t.flavor === f && (t.reason === "shipment" || t.reason === "order")) ? "logged" : "estimated");

  return (
    <div className="space-y-10">
      <header className="animate-rise space-y-2 pt-2">
        <p className="eyebrow">Supply</p>
        <h1 className="text-5xl sm:text-6xl">{total === 0 ? "Out of cans." : `${total} cans on hand.`}</h1>
        <p className="max-w-prose text-taupe-strong">Counts change only when you log a drink, confirm a delivery or correct stock. Nothing about your shipments or charges changes unless you confirm it.</p>
      </header>

      {state.mode === "demo" ? <Callout tone="demo" title="Simulated commerce">Orders, deliveries and charges are simulated. Nothing ships and no payment is ever collected.</Callout> : null}

      {sug.length > 0 ? (
        <section aria-labelledby="rep-h" className="space-y-3">
          <h2 id="rep-h" className="eyebrow">Suggested for you · needs your confirmation</h2>
          {sug.map((s) => <ReplenishCard key={s.id} id={s.id} title={s.title} detail={s.detail} />)}
        </section>
      ) : rate.spanDays < policy.replenishment.minLoggedDays && sub.status !== "none" ? (
        <p className="text-sm text-taupe-strong">Replenishment suggestions appear after about {policy.replenishment.minLoggedDays} days of logged drinks, so they&rsquo;re based on your real pace.</p>
      ) : null}

      <section aria-labelledby="stock-h" className="space-y-3">
        <h2 id="stock-h" className="eyebrow">By flavor</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          {FLAVORS.map((f) => (
            <li key={f} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 p-4">
              <Can flavor={f} />
              <div>
                <p className="font-medium">{getProduct(state, f).name}</p>
                <p className="text-sm text-taupe-strong"><Badge tone={basis(f) === "logged" ? "live" : "warn"}>{basis(f) === "logged" ? "Logged" : "Estimated"}</Badge></p>
              </div>
              <div className="flex items-center gap-4">
                <p className="tabular font-display text-4xl">{stock[f]}</p>
                <StockEditor flavor={f} count={stock[f]} />
              </div>
            </li>
          ))}
        </ul>
        {FLAVORS.some((f) => stock[f] === 0) ? <p className="text-sm text-taupe-strong">Flavors with no stock aren&rsquo;t suggested.</p> : null}
      </section>

      <section aria-labelledby="sub-h" className="space-y-3">
        <h2 id="sub-h" className="eyebrow">Subscription</h2>
        {sub.status === "none" ? (
          <EmptyState title="No subscription yet" action={<Button asChild><Link href="/shop">Browse &amp; subscribe</Link></Button>}>
            Monthly delivery is the default: {money(7200)} for 24 mixed cans. Pause, skip, advance or delay anytime.
          </EmptyState>
        ) : (
          <div className="space-y-5 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-display text-2xl">{money(sub.priceCents)} · {sub.cans} cans monthly</p>
              <Badge tone={sub.status === "active" ? "live" : "warn"}>{sub.status === "active" ? "Active (simulated)" : "Paused"}</Badge>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-taupe-strong">Contents</dt>
                <dd>{FLAVORS.map((f) => `${sub.mix[f]} ${getProduct(state, f).name}`).join(" · ")}</dd>
              </div>
              <div>
                <dt className="text-sm text-taupe-strong">Next shipment</dt>
                <dd>{sub.status === "paused" ? "None while paused" : next ? `${formatDayLong(next.date)}${next.note ? ` (${next.note})` : ""}` : "None scheduled"}</dd>
              </div>
            </dl>
            <SubscriptionControls status={sub.status === "paused" ? "paused" : "active"} nextDate={next?.date ?? null} mix={sub.mix} cans={sub.cans} minAdvance={addDays(today, policy.subscription.advanceMinDaysFromToday)} delays={[...policy.subscription.delayChoicesDays]} today={today} />
            {ship.length > 0 ? (
              <div className="space-y-2 border-t border-line pt-4">
                <p className="text-sm font-medium">Shipments</p>
                <ul className="divide-y divide-line text-sm">
                  {ship.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{formatDayShort(s.date)} · {FLAVORS.map((f) => s.mix[f]).join("/")} cans <Badge className="ml-1">{s.status === "scheduled" ? "Scheduled" : "Skipped"}</Badge>{s.note ? <span className="text-taupe-strong"> · {s.note}</span> : null}</span>
                      {s.status === "scheduled" ? <ConfirmDeliveryButton kind="shipment" id={s.id} /> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {pendingTrials.length > 0 ? (
        <section className="space-y-3" aria-labelledby="trial-h">
          <h2 id="trial-h" className="eyebrow">Orders awaiting simulated delivery</h2>
          {pendingTrials.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-sm">
              <span>{o.number} · {o.cans} cans · {money(o.priceCents)} <Badge tone="demo">Simulated</Badge></span>
              <ConfirmDeliveryButton kind="order" id={o.id} />
            </div>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="hist-h" className="space-y-3">
        <h2 id="hist-h" className="eyebrow">Consumption history</h2>
        {history.length === 0 ? (
          <EmptyState title="Nothing logged yet">When you tap &ldquo;Had one&rdquo; or log a drink, it shows up here and updates your count.</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface px-4">
            {history.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{formatDayShort(localDateOf(Date.parse(c.at), tz))}, {formatTime(Date.parse(c.at), tz)} · {getProduct(state, c.flavor).name}<span className="text-taupe-strong">{c.recommendationId ? " · from a suggestion" : " · logged manually"}</span></span>
                <UndoLogButton id={c.id} />
              </li>
            ))}
          </ul>
        )}
        {rate.total > 0 ? <p className="text-xs text-taupe-strong">About {rate.perDay.toFixed(1)} cans/day over the last {rate.spanDays} day{rate.spanDays === 1 ? "" : "s"} of logs (an estimate).</p> : null}
      </section>

      <Button asChild variant="outline"><Link href="/shop">Browse &amp; order</Link></Button>
    </div>
  );
}
