import Link from "next/link";
import { ArrowRight, CalendarCheck2, Check, Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AppPreview } from "@/components/app/app-preview";
import { Can, CanTrio } from "@/components/brand/can";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { BASE_PRODUCTS, FLAVORS, OFFERS, money, pricePerCan } from "@/config/products";
import { getCtx } from "@/lib/session";

const accent = { chai: "text-chai-ink", oolong: "text-oolong-ink", matcha: "text-matcha-ink" } as const;

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string; demo_error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" aria-label="interval, home">
          <Wordmark size="md" />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <a href="#flavors" className="hidden rounded-full px-3 py-2 text-sm text-taupe-strong hover:text-espresso sm:block">Flavors</a>
          <a href="#planning" className="hidden rounded-full px-3 py-2 text-sm text-taupe-strong hover:text-espresso sm:block">How it works</a>
          <a href="#offers" className="hidden rounded-full px-3 py-2 text-sm text-taupe-strong hover:text-espresso sm:block">Offers</a>
          {ctx ? (
            <Button asChild size="sm"><Link href="/today">Open app</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
              <Button asChild size="sm"><Link href="/signup">Sign up</Link></Button>
            </>
          )}
        </nav>
      </header>

      <main id="main">
        {sp.demo_error ? (
          <div className="mx-auto max-w-6xl px-5 md:px-10">
            <Callout tone="error" title="The demo couldn’t start">
              The server failed to create your demo session ({sp.demo_error.slice(0, 120)}). If this is your own deployment, check the Supabase keys and that the migrations ran, or set DEMO_STORE=memory.
            </Callout>
          </div>
        ) : null}
        {sp.deleted ? (
          <div className="mx-auto max-w-6xl px-5 md:px-10">
            <Callout tone="success" title="Your account and data were deleted.">Imported calendar data, preferences, logs and credentials are gone.</Callout>
          </div>
        ) : null}

        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.1fr_1fr] md:px-10 md:pb-24 md:pt-14">
          <div className="animate-rise space-y-7">
            <p className="eyebrow">Ready-to-drink protein tea · 12 oz</p>
            <h1 className="text-[3rem] leading-[0.98] sm:text-7xl">Protein tea that fits your day.</h1>
            <p className="font-display text-2xl italic text-burnt-ink">Tea that keeps up.</p>
            <p className="max-w-[34rem] text-lg text-taupe-strong">
              Chai, oolong and matcha, brewed from real tea with 20 g of milk protein per can. interval looks at your calendar, finds the workout and the busy stretch, and suggests one convenient moment to have one. Never more than two a day.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><a href="/demo">Explore demo <ArrowRight aria-hidden /></a></Button>
              <Button asChild size="lg" variant="outline"><Link href="/signup">Create account</Link></Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-taupe-strong">
              {["20 g milk protein", "Real brewed tea", "Under 5 g sugar"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="size-4 text-burnt" aria-hidden />{t}</li>
              ))}
            </ul>
            <p className="max-w-[34rem] text-xs text-taupe-strong">Contains milk. interval is a hypothetical product built for an academic project; nothing here ships, charges or sells.</p>
          </div>
          <div className="rounded-[var(--radius-xl)] bg-cream-deep px-6 pb-8 pt-12 sm:px-12">
            <CanTrio />
          </div>
        </section>

        {/* Flavors */}
        <section id="flavors" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-10 md:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="eyebrow">Three flavors</p>
                <h2 className="text-4xl sm:text-5xl">Quiet, not sugary.</h2>
              </div>
              <Button asChild variant="outline"><Link href="/shop">See nutrition & ingredients</Link></Button>
            </div>
            <ul className="mt-10 grid gap-10 sm:grid-cols-3">
              {FLAVORS.map((f) => {
                const p = BASE_PRODUCTS[f];
                return (
                  <li key={f} className="grid grid-cols-[5rem_1fr] items-end gap-5 sm:grid-cols-1">
                    <div className="mx-auto w-20 sm:w-28"><Can flavor={f} /></div>
                    <div className="space-y-2 sm:text-center">
                      <h3 className={`text-3xl ${accent[f]}`}>{p.name}</h3>
                      <p className="font-display italic text-taupe-strong">{p.tagline}</p>
                      <p className="text-sm text-taupe-strong">{p.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Calendar planning */}
        <section id="planning" className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-[1fr_22rem] md:px-10 md:py-24">
          <div className="space-y-10">
            <div className="space-y-2">
              <p className="eyebrow">Calendar planning</p>
              <h2 className="max-w-[18ch] text-4xl sm:text-5xl">A plan that reads your day, then gets out of the way.</h2>
            </div>
            <ol className="space-y-7">
              {[
                { i: CalendarCheck2, t: "Connect read-only, or skip it", d: "Sign-in and calendar access are separate steps. We ask for read-only access, import only titles, times and availability, and never descriptions or attendees." },
                { i: SlidersHorizontal, t: "We find the workouts and the gaps", d: "Clear titles are recognized by rules. Ambiguous ones are checked and you confirm anything uncertain. A calendar event is a plan, not proof you worked out." },
                { i: Lock, t: "One calm suggestion, with the reason", d: "A time, a flavor, and why. Quiet hours, your caffeine cutoff, stock and a two-a-day cap are all checked by code, not by a model." },
                { i: ShieldCheck, t: "You stay in control", d: "Change the time or flavor, dismiss with a reason, or tell us in plain words how to adjust your week. You see a before/after preview and can undo." },
              ].map(({ i: Icon, t, d }) => (
                <li key={t} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span className="grid size-10 place-items-center rounded-full border border-line bg-surface"><Icon className="size-5 text-burnt" aria-hidden /></span>
                  <div>
                    <h3 className="text-xl">{t}</h3>
                    <p className="mt-1 max-w-prose text-sm text-taupe-strong">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="max-w-prose rounded-[var(--radius-md)] border border-line bg-cream-deep p-4 text-sm text-taupe-strong">
              <strong className="text-espresso">Our hypothesis, not a result:</strong> we think planning that&rsquo;s actually useful could help people keep a subscription. We haven&rsquo;t proven that, and this academic project has no customers or traction to report.
            </p>
          </div>
          <AppPreview />
        </section>

        {/* Offers */}
        <section id="offers" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl space-y-10 px-5 py-16 md:px-10 md:py-20">
            <div className="space-y-2">
              <p className="eyebrow">Start small</p>
              <h2 className="text-4xl sm:text-5xl">A trial box, or a monthly box.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {[OFFERS.trial, OFFERS.subscription].map((o) => (
                <div key={o.id} className="flex flex-col justify-between gap-6 rounded-[var(--radius-xl)] border border-line bg-cream p-7">
                  <div className="space-y-3">
                    <p className="eyebrow">{o.recurring ? "Monthly subscription" : "Trial"}</p>
                    <p className="font-display text-6xl">{money(o.priceCents)}</p>
                    <p className="text-lg">{o.cans} cans · {pricePerCan(o)} each</p>
                    <p className="text-sm text-taupe-strong">{o.blurb} Mixed-flavor boxes. {o.recurring ? "Pause or skip whenever you like." : "No commitment."}</p>
                  </div>
                  <Button asChild size="lg" variant={o.recurring ? "accent" : "primary"}><Link href="/shop">{o.recurring ? "Choose subscription" : "Try the trial"}</Link></Button>
                </div>
              ))}
            </div>
            <p className="max-w-prose text-sm text-taupe-strong">Checkout is simulated: no card is collected, nothing is charged, and nothing ships. Prices and specifications are hypothetical and stored as configurable data.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 text-center md:px-10">
          <h2 className="mx-auto max-w-[16ch] text-4xl sm:text-5xl">See your week the way interval does.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><a href="/demo">Explore demo <ArrowRight aria-hidden /></a></Button>
            <Button asChild size="lg" variant="outline"><Link href="/signup">Sign up</Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs text-taupe-strong md:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Wordmark size="sm" />
            <nav aria-label="Footer" className="flex gap-4">
              <Link href="/privacy" className="underline underline-offset-2">Privacy & data retention</Link>
              <Link href="/shop" className="underline underline-offset-2">Shop</Link>
            </nav>
          </div>
          <p>interval is a hypothetical brand for an academic project. Product specifications are not verified. Contains milk. Caffeine per can is not established; demo values are illustrative. General caffeine guidance is not individual medical advice. Drinks are not meal replacements.</p>
        </div>
      </footer>
    </div>
  );
}
