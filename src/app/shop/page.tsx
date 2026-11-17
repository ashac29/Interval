import type { Metadata } from "next";
import Link from "next/link";
import { MixPicker } from "@/components/app/mix-picker";
import { Can } from "@/components/brand/can";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { BASE_PRODUCTS, FLAVORS } from "@/config/products";
import { caffeineLabel, getProduct } from "@/lib/domain/catalog";
import { createInitialState } from "@/lib/domain/state";
import { getCtx, loadState } from "@/lib/session";

export const metadata: Metadata = { title: "Shop" };

export default async function Shop() {
  const ctx = await getCtx();
  const state = ctx ? (await loadState(ctx)).state : createInitialState({ mode: "live", timezone: "UTC", now: new Date() });
  return (
    <div className="space-y-10 pt-2">
      <header className="space-y-2">
        <p className="eyebrow">Shop</p>
        <h1 className="text-5xl sm:text-6xl">Three flavors, one box.</h1>
        <p className="max-w-prose text-taupe-strong">12 oz cans. 20 g milk protein, real brewed tea, under 5 g sugar. Mixed-flavor boxes. Contains milk.</p>
      </header>
      <Callout tone="demo" title="Simulated checkout">No payment is collected, nothing ships and nothing is charged. Prices and specs are hypothetical, stored as configurable data.</Callout>
      <ul className="grid gap-5 sm:grid-cols-3">
        {FLAVORS.map((f) => {
          const p = getProduct(state, f);
          return (
            <li key={f}>
              <Link href={`/shop/${f}`} className="grid h-full grid-cols-[4rem_1fr] items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:bg-cream-deep sm:grid-cols-1 sm:text-center">
                <div className="mx-auto w-14 sm:w-20"><Can flavor={f} /></div>
                <div className="space-y-1">
                  <p className="font-display text-2xl">{p.name}</p>
                  <p className="text-sm text-taupe-strong">{BASE_PRODUCTS[f].tagline}</p>
                  <Badge tone={p.caffeine.status === "unknown" ? "neutral" : "demo"}>{caffeineLabel(p.caffeine)}</Badge>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="build-h" className="space-y-3">
        <h2 id="build-h" className="text-3xl">Build your box</h2>
        <MixPicker />
      </section>
    </div>
  );
}
