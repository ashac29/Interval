import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import { Agenda } from "@/components/app/agenda";
import { CaffeineGuidance, trackedLabel } from "@/components/app/caffeine-note";
import { ExposureBeacon } from "@/components/app/exposure";
import { LogCaffeineDialog, LogDrinkDialog, RemoveCaffeineButton, UndoLogButton } from "@/components/app/log-dialogs";
import { RecCard, WhyThis } from "@/components/app/rec-card";
import { RecControls } from "@/components/app/rec-controls";
import { flavorOptions, recLite } from "@/lib/rec-view";
import { WorkoutConfirm } from "@/components/app/workout-confirm";
import { Can } from "@/components/brand/can";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getProduct } from "@/lib/domain/catalog";
import { formatDayShort, formatTime } from "@/lib/domain/time";
import { pageData } from "@/lib/session";
import { todayView } from "@/lib/views";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const { state, now } = await pageData();
  const v = todayView(state, now);
  const tz = state.prefs.timezone;
  const demo = state.mode === "demo";
  const capLabel = `${v.tally.counted} of ${v.tally.cap}`;
  const pct = Math.min(100, Math.round((v.tally.trackedMg / Math.max(1, v.tally.ceilingMg)) * 100));

  return (
    <div className="space-y-10">
      <header className="animate-rise space-y-2 pt-2">
        <p className="eyebrow">{v.label}</p>
        <h1 className="max-w-[16ch] text-[2.6rem] leading-[1.02] sm:text-6xl">{v.headline}</h1>
        <p className="max-w-prose text-base text-taupe-strong">{v.subhead}</p>
      </header>

      {/* Next suggested drink */}
      <section aria-labelledby="next-h" className="animate-rise space-y-4" style={{ animationDelay: "60ms" }}>
        <h2 id="next-h" className="eyebrow">
          Next suggested drink
        </h2>
        {v.next ? (
          <>
            <ExposureBeacon ids={v.open.filter((r) => r.status === "proposed").map((r) => r.id)} />
            <div className="grid gap-6 rounded-[var(--radius-xl)] border border-line bg-surface p-5 sm:grid-cols-[9rem_1fr] sm:p-7">
              <div className="mx-auto w-24 sm:w-full">
                <Can flavor={v.next.flavor} />
              </div>
              <div className="space-y-4">
                <div>
                  <p className="tabular font-display text-5xl leading-none sm:text-6xl">{formatTime(Date.parse(v.next.startUtc), tz)}</p>
                  <p className="mt-2 text-lg">
                    {getProduct(state, v.next.flavor).name}
                    <span className="text-taupe-strong"> · {v.next.kind === "post_workout" ? "after your workout" : v.next.kind === "pre_workout" ? "before your workout" : "in your longest open gap"}</span>
                  </p>
                </div>
                <p className="max-w-prose text-[0.95rem]">{v.next.reason}</p>
                {v.next.conflict ? (
                  <Callout tone="warning" title="Needs a look">
                    {v.next.conflict.message}
                  </Callout>
                ) : null}
                <RecControls rec={recLite(state, v.next)} options={flavorOptions(state, v.next, now)} />
                <WhyThis rec={v.next} />
              </div>
            </div>
            {v.later.length > 0 ? (
              <div className="space-y-3">
                <p className="eyebrow">Later today</p>
                {v.later.map((r) => (
                  <RecCard key={r.id} state={state} rec={r} now={now} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-line p-6 sm:p-8">
            <p className="font-display text-3xl">No drink suggested right now.</p>
            <p className="mt-2 max-w-prose text-taupe-strong">That&rsquo;s a valid plan. Suggestions are a ceiling, not a goal.</p>
            {v.note && v.note.messages.length > 0 ? (
              <ul className="mt-4 space-y-1.5 text-sm">
                {v.note.messages.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-burnt" />
                    {m}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <LogDrinkDialog stock={v.stock as never} />
            </div>
          </div>
        )}
      </section>

      {v.needsConfirmation.length > 0 ? (
        <section aria-labelledby="confirm-h" className="space-y-3">
          <h2 id="confirm-h" className="eyebrow">
            Needs your confirmation
          </h2>
          {v.needsConfirmation.map((e) => (
            <WorkoutConfirm key={e.key} eventKey={e.key} title={e.title} when={`${e.start}–${e.end}`} reason={e.classificationReason ?? "The title is ambiguous."} confidence={e.confidence} />
          ))}
        </section>
      ) : null}

      {v.conflicts.length > 0 ? (
        <Callout tone="warning" title="Your calendar changed">
          {v.conflicts.length === 1 ? "A suggestion in your plan was affected." : `${v.conflicts.length} suggestions in your plan were affected.`} Review them in <Link href="/plan" className="underline">Plan</Link>.
        </Callout>
      ) : null}

      {/* Day numbers: one ruled panel instead of three identical cards */}
      <section aria-labelledby="day-h" className="space-y-3">
        <h2 id="day-h" className="eyebrow">
          Today in numbers
        </h2>
        <dl className="grid divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="space-y-1 p-5">
            <dt className="text-sm text-taupe-strong">Drinks counted today</dt>
            <dd className="tabular font-display text-4xl">{capLabel}</dd>
            <dd className="text-xs text-taupe-strong">Limit is a cap, not a target. Planned + logged both count.</dd>
          </div>
          <div className="space-y-1 p-5">
            <dt className="text-sm text-taupe-strong">Tracked caffeine</dt>
            <dd className="tabular font-display text-4xl">
              {v.tally.hasUnknown ? "≥ " : ""}
              {v.tally.trackedMg}
              <span className="text-lg text-taupe-strong"> mg</span>
            </dd>
            <dd>
              <div className="h-1.5 overflow-hidden rounded-full bg-cream-deep" role="img" aria-label={`${pct}% of your ${v.tally.ceilingMg} mg ceiling`}>
                <div className="h-full rounded-full bg-burnt" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-taupe-strong">{trackedLabel(v.tally)} · your ceiling {v.tally.ceilingMg} mg</p>
            </dd>
          </div>
          <div className="space-y-1 p-5">
            <dt className="text-sm text-taupe-strong">Cans remaining</dt>
            <dd className="tabular font-display text-4xl">{v.stockTotal}</dd>
            <dd className="text-xs text-taupe-strong">
              {state.stockCorrectedAt.chai || state.stockCorrectedAt.oolong || state.stockCorrectedAt.matcha ? "Logged" : "Estimated"} · {v.ship ? `next simulated shipment ${formatDayShort(v.ship.date)} (${v.ship.cans} cans)` : "no shipment scheduled"}
            </dd>
          </div>
        </dl>
        <CaffeineGuidance demo={demo} />
      </section>

      {/* Agenda */}
      <section aria-labelledby="agenda-h" className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 id="agenda-h" className="eyebrow">
            Today&rsquo;s agenda
          </h2>
          <p className="text-xs text-taupe-strong">{v.busyHours} h occupied · overlaps merged</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface px-5 py-2">
          <Agenda items={v.agenda} empty={state.calendar.status === "not_connected" ? "No calendar connected. Add one in Account to plan around your day." : "Nothing on your calendar today."} />
        </div>
      </section>

      {/* Logging */}
      <section aria-labelledby="log-h" className="space-y-3">
        <h2 id="log-h" className="eyebrow">
          Logged today
        </h2>
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          {v.consumedToday.length === 0 && v.externalToday.length === 0 ? <p className="text-sm text-taupe-strong">Nothing logged yet.</p> : null}
          <ul className="divide-y divide-line">
            {v.consumedToday.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {formatTime(Date.parse(c.at), tz)} · {getProduct(state, c.flavor).name}
                  <span className="text-taupe-strong"> · {c.caffeine.mg === null ? "caffeine not established" : `${c.caffeine.mg} mg${c.caffeine.status === "illustrative" ? " (illustrative)" : ""}`}</span>
                </span>
                <UndoLogButton id={c.id} />
              </li>
            ))}
            {v.externalToday.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {formatTime(Date.parse(c.at), tz)} · {c.label}
                  <span className="text-taupe-strong"> · {c.mg === null ? "amount unknown" : `~${c.mg} mg`}</span>
                </span>
                <RemoveCaffeineButton id={c.id} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <LogDrinkDialog stock={v.stock as never} />
            <LogCaffeineDialog />
          </div>
        </div>
      </section>

      <section className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Package className="size-5 text-taupe-strong" aria-hidden />
          <p className="text-sm">
            {v.stockTotal} cans on hand
            {v.ship ? ` · next simulated shipment ${formatDayShort(v.ship.date)}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/supply">
            Open Supply <ArrowRight aria-hidden />
          </Link>
        </Button>
      </section>
    </div>
  );
}
