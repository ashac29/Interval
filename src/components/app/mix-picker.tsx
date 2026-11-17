"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Can } from "@/components/brand/can";
import { Button } from "@/components/ui/button";
import { FLAVORS, OFFERS, defaultMix, money, pricePerCan, type Flavor, type OfferId } from "@/config/products";
import { cn } from "@/lib/utils";

const NAMES: Record<Flavor, string> = { chai: "Chai", oolong: "Oolong", matcha: "Matcha" };

export function MixPicker({ initialOffer = "subscription", initialFlavor }: { initialOffer?: OfferId; initialFlavor?: Flavor }) {
  const router = useRouter();
  const [offer, setOffer] = React.useState<OfferId>(initialOffer);
  const o = OFFERS[offer];
  const [mix, setMix] = React.useState<Record<Flavor, number>>(() => {
    const m = defaultMix(OFFERS[initialOffer].cans);
    if (initialFlavor) {
      const cans = OFFERS[initialOffer].cans;
      const rest = Math.floor((cans - Math.ceil(cans / 2)) / 2);
      const base = { chai: rest, oolong: rest, matcha: rest } as Record<Flavor, number>;
      base[initialFlavor] = cans - rest * 2;
      return base;
    }
    return m;
  });
  const total = FLAVORS.reduce((s, f) => s + mix[f], 0);
  const choose = (id: OfferId) => {
    setOffer(id);
    setMix(defaultMix(OFFERS[id].cans));
  };
  const set = (f: Flavor, v: number) => setMix({ ...mix, [f]: Math.max(0, Math.min(o.cans, v)) });
  const ok = total === o.cans;
  return (
    <div className="space-y-6 rounded-[var(--radius-xl)] border border-line bg-surface p-5 sm:p-7">
      <div role="radiogroup" aria-label="Choose an offer" className="grid gap-3 sm:grid-cols-2">
        {[OFFERS.trial, OFFERS.subscription].map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={offer === x.id} onClick={() => choose(x.id as OfferId)} className={cn("rounded-[var(--radius-lg)] border p-4 text-left transition-colors", offer === x.id ? "border-espresso bg-cream-deep" : "border-line hover:bg-cream-deep")}>
            <p className="eyebrow">{x.recurring ? "Monthly" : "One time"}</p>
            <p className="font-display text-3xl">{money(x.priceCents)}</p>
            <p className="text-sm text-taupe-strong">{x.cans} cans · {pricePerCan(x)} each</p>
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <p className="font-medium">Pick your mix</p>
        {FLAVORS.map((f) => (
          <div key={f} className="grid grid-cols-[2rem_1fr_auto] items-center gap-4">
            <Can flavor={f} />
            <span className="font-medium">{NAMES[f]}</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label={`Fewer ${NAMES[f]}`} onClick={() => set(f, mix[f] - 1)}>−</Button>
              <span className="tabular w-8 text-center" aria-live="polite">{mix[f]}</span>
              <Button size="icon" variant="outline" aria-label={`More ${NAMES[f]}`} onClick={() => set(f, mix[f] + 1)}>+</Button>
            </div>
          </div>
        ))}
        <p className={cn("text-sm", ok ? "text-success" : "text-danger")} role="status">{total} of {o.cans} cans selected{ok ? "" : total < o.cans ? ` — add ${o.cans - total} more` : ` — remove ${total - o.cans}`}</p>
      </div>
      <Button size="lg" disabled={!ok} onClick={() => router.push(`/shop/checkout?offer=${offer}&chai=${mix.chai}&oolong=${mix.oolong}&matcha=${mix.matcha}`)}>
        Continue to simulated checkout
      </Button>
    </div>
  );
}
