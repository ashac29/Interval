import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MixPicker } from "@/components/app/mix-picker";
import { Can } from "@/components/brand/can";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { FLAVORS, type Flavor } from "@/config/products";
import { caffeineLabel, getProduct } from "@/lib/domain/catalog";
import { createInitialState } from "@/lib/domain/state";
import { getCtx, loadState } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ flavor: string }> }): Promise<Metadata> {
  const { flavor } = await params;
  return { title: FLAVORS.includes(flavor as Flavor) ? `${flavor[0]!.toUpperCase()}${flavor.slice(1)}` : "Flavor" };
}

export default async function FlavorPage({ params }: { params: Promise<{ flavor: string }> }) {
  const { flavor } = await params;
  if (!FLAVORS.includes(flavor as Flavor)) notFound();
  const f = flavor as Flavor;
  const ctx = await getCtx();
  const state = ctx ? (await loadState(ctx)).state : createInitialState({ mode: "live", timezone: "UTC", now: new Date() });
  const p = getProduct(state, f);
  return (
    <div className="space-y-10 pt-2">
      <Link href="/shop" className="text-sm text-taupe-strong underline underline-offset-2">← All flavors</Link>
      <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
        <div className="mx-auto w-40 rounded-[var(--radius-xl)] bg-cream-deep px-8 pb-6 pt-8 md:w-full"><Can flavor={f} /></div>
        <div className="space-y-5">
          <div className="space-y-2">
            <h1 className="text-5xl sm:text-6xl">{p.name}</h1>
            <p className="font-display text-xl italic text-taupe-strong">{p.tagline}</p>
            <p className="max-w-prose">{p.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="outline">{p.canSize} can</Badge>
            <Badge tone="outline">{p.proteinGrams} g milk protein</Badge>
            <Badge tone="outline">Under {p.sugarGramsMax} g sugar</Badge>
            <Badge tone="warn">Contains milk</Badge>
          </div>
          <dl className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface text-sm">
            {[
              ["Tea", p.tea],
              ["Ingredients", `${p.ingredients.join(", ")}${p.ingredientsVerified ? "" : " (hypothetical, not verified)"}`],
              ["Allergens", p.allergens.join(", ")],
              ["Protein", `${p.nutrition.proteinG} g per can`],
              ["Sugar", `${p.nutrition.sugarG} g per can`],
              ["Calories", p.nutrition.calories === null ? "Not established" : String(p.nutrition.calories)],
              ["Caffeine", caffeineLabel(p.caffeine)],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3"><dt className="text-taupe-strong">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-taupe-strong">{p.nutrition.note} Compatibility with dietary restrictions can&rsquo;t be confirmed without verified ingredient data, so we don&rsquo;t claim it. {p.caffeine.status !== "verified" ? "Caffeine per can is not established; any number shown is illustrative." : ""}</p>
        </div>
      </div>
      <Callout tone="demo" title="Simulated checkout">No payment is collected and nothing ships.</Callout>
      <MixPicker initialFlavor={f} />
    </div>
  );
}
