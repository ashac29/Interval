import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FLAVORS, money } from "@/config/products";
import { addDays, formatDayLong, localDateOf } from "@/lib/domain/time";
import { getCtx, loadState } from "@/lib/session";

export const metadata: Metadata = { title: "Order confirmation (simulated)" };

export default async function Confirmation({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const { o } = await searchParams;
  const ctx = await getCtx();
  if (!ctx) notFound();
  const { state } = await loadState(ctx);
  const order = state.orders.find((x) => x.id === o);
  if (!order) notFound();
  const eta = formatDayLong(addDays(localDateOf(Date.parse(order.placedAt), state.prefs.timezone), 3));
  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <p className="eyebrow">Simulated order confirmation</p>
      <h1 className="text-5xl">Order placed (simulated).</h1>
      <Callout tone="success" title={`Order ${order.number}`}>Nothing was charged and nothing will ship. This confirmation exists so you can try the full flow.</Callout>
      <dl className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface text-sm">
        {[
          ["Items", `${order.cans} cans: ${FLAVORS.map((f) => `${order.mix[f]} ${f}`).join(" · ")}`],
          ["Total (simulated)", money(order.priceCents)],
          ["Simulated ship-to", `${order.shipTo.name}, ${order.shipTo.city}`],
          ["Pretend delivery", eta],
          ["Type", order.offer === "subscription" ? "Monthly subscription: manage it in Supply" : "Trial box: confirm the simulated delivery in Supply to add cans to your stock"],
        ].map(([k, v]) => <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-3"><dt className="text-taupe-strong">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className="flex gap-2"><Button asChild><Link href="/supply">Go to Supply</Link></Button><Button asChild variant="outline"><Link href="/today">Back to Today</Link></Button></div>
    </div>
  );
}
