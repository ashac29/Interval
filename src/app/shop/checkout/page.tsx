import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/app/checkout-form";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FLAVORS, OFFERS, money, type Flavor, type OfferId } from "@/config/products";
import { validateMix } from "@/lib/domain/commerce";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Checkout (simulated)" };

export default async function Checkout({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const offerId = (sp.offer === "trial" || sp.offer === "subscription" ? sp.offer : null) as OfferId | null;
  if (!offerId) redirect("/shop");
  const offer = OFFERS[offerId];
  const mix = Object.fromEntries(FLAVORS.map((f) => [f, Math.max(0, Math.trunc(Number(sp[f]) || 0))])) as Record<Flavor, number>;
  const err = validateMix(mix, offer.cans);
  const ctx = await getCtx();
  return (
    <div className="mx-auto max-w-xl space-y-8 pt-2">
      <header className="space-y-2">
        <p className="eyebrow">Checkout</p>
        <h1 className="text-5xl">Simulated order.</h1>
      </header>
      <Callout tone="demo" title="No real payment">This is a simulation for an academic project. No card is collected, nothing is charged, and nothing ships.</Callout>
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
        <p className="flex justify-between font-display text-2xl"><span>{offer.name}</span><span>{money(offer.priceCents)}</span></p>
        <p className="text-sm text-taupe-strong">{offer.cans} cans: {FLAVORS.map((f) => `${mix[f]} ${f}`).join(" · ")}{offer.recurring ? " · repeats monthly until you pause or cancel (simulated)" : ""}</p>
        <Link href="/shop" className="text-sm underline underline-offset-2">Change selection</Link>
      </section>
      {err ? <Callout tone="error" title="Check your mix">{err}</Callout> : null}
      {!ctx ? (
        <Callout tone="info" title="Start a session to place a simulated order">
          Orders are stored privately for your session.
          <div className="mt-3 flex gap-2"><Button asChild size="sm"><a href="/demo">Explore demo</a></Button><Button asChild size="sm" variant="outline"><Link href="/signup">Sign up</Link></Button></div>
        </Callout>
      ) : err ? null : <CheckoutForm offer={offerId} mix={mix} />}
    </div>
  );
}
