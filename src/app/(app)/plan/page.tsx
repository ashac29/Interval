import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AdjustWeek } from "@/components/app/adjust-week";
import { Agenda } from "@/components/app/agenda";
import { BriefCard } from "@/components/app/brief-card";
import { ExposureBeacon } from "@/components/app/exposure";
import { RecCard } from "@/components/app/rec-card";
import { WorkoutConfirm } from "@/components/app/workout-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { aiStatus } from "@/lib/ai";
import { buildBriefInput, deterministicBrief } from "@/lib/domain/brief";
import { NL_EXAMPLES } from "@/lib/domain/prefs-nl";
import { getProduct } from "@/lib/domain/catalog";
import { formatTime } from "@/lib/domain/time";
import { pageData } from "@/lib/session";
import { cn } from "@/lib/utils";
import { weekView } from "@/lib/views";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const offset = Math.max(-2, Math.min(2, Number(w) || 0));
  const { state, now } = await pageData();
  const v = weekView(state, now, offset);
  const tz = state.prefs.timezone;
  const proposed = v.days.flatMap((d) => d.recs).filter((r) => r.status === "proposed");
  const confirm = v.days.flatMap((d) => d.agenda.filter((a) => a.kind === "needs_confirmation"));
  const brief = state.briefs.find((b) => b.weekStart === v.weekStart) ?? null;
  const currentFp = offset === 0 ? JSON.stringify(deterministicBrief(buildBriefInput(state, now)).referencedRecommendationIds) : null;
  const stale = Boolean(brief && currentFp && JSON.stringify(brief.referencedRecommendationIds) !== currentFp);
  const ai = aiStatus(state.mode);

  return (
    <div className="space-y-10">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4 pt-2">
        <div className="space-y-2">
          <p className="eyebrow">Week of {v.days[0]!.short}</p>
          <h1 className="text-5xl sm:text-6xl">Your week.</h1>
        </div>
        <nav aria-label="Week" className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/plan?w=${offset - 1}`} aria-label="Previous week"><ChevronLeft aria-hidden /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/plan">This week</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/plan?w=${offset + 1}`} aria-label="Next week"><ChevronRight aria-hidden /></Link></Button>
        </nav>
      </header>

      {state.calendar.status === "not_connected" ? (
        <Callout tone="info" title="No calendar connected" action={<Button asChild size="sm" variant="outline"><Link href="/account">Connect</Link></Button>}>
          Without a calendar there are no workouts or busy days to plan around. You can still log drinks and manage supply.
        </Callout>
      ) : null}
      {state.calendar.status === "needs_reconnect" || state.calendar.status === "error" ? (
        <Callout tone="warning" title="Calendar sync needs attention" action={<Button asChild size="sm" variant="outline"><Link href="/account">Fix</Link></Button>}>{state.calendar.lastError}</Callout>
      ) : null}

      <BriefCard brief={brief ? { headline: brief.headline, paragraphs: brief.paragraphs, source: brief.source, stale } : null} />

      {confirm.length > 0 ? (
        <section aria-labelledby="c-h" className="space-y-3">
          <h2 id="c-h" className="eyebrow">Confirm workouts</h2>
          {confirm.map((e) => (
            <WorkoutConfirm key={e.key} eventKey={e.key} title={e.title} when={`${e.start}–${e.end}`} reason={e.classificationReason ?? "Ambiguous title."} confidence={e.confidence} />
          ))}
        </section>
      ) : null}

      {/* Desktop: week at a glance */}
      <section aria-labelledby="glance-h" className="hidden space-y-3 lg:block">
        <h2 id="glance-h" className="eyebrow">Week at a glance</h2>
        <div className="grid grid-cols-7 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          {v.days.map((d) => (
            <div key={d.date} className={cn("min-h-52 space-y-2 border-l border-line p-2.5 first:border-l-0", d.isToday && "bg-cream-deep/60", d.isPast && "opacity-60")}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-taupe-strong">{d.weekday}</p>
                <p className={cn("font-display text-xl", d.isToday && "text-burnt-ink")}>{Number(d.date.slice(8))}</p>
              </div>
              <ul className="space-y-1.5">
                {d.agenda.slice(0, 5).map((a) => (
                  <li key={a.key} className={cn("rounded-[6px] px-1.5 py-1 text-[11px] leading-tight", a.kind === "workout" ? "bg-success-tint" : a.kind === "needs_confirmation" ? "bg-warning-tint" : a.kind === "excluded" ? "text-taupe-strong line-through" : "bg-cream-deep")}>
                    <span className="tabular">{a.start}</span> <span className="break-words">{a.title}</span>
                  </li>
                ))}
                {d.agenda.length > 5 ? <li className="text-[11px] text-taupe-strong">+{d.agenda.length - 5} more</li> : null}
                {d.recs.map((r) => (
                  <li key={r.id} className="rounded-[6px] border border-burnt/50 bg-[#f6e3cf] px-1.5 py-1 text-[11px] font-medium leading-tight text-burnt-ink">
                    {formatTime(Date.parse(r.startUtc), tz)} · {getProduct(state, r.flavor).name}
                    {r.status === "accepted" ? " ✓" : ""}
                  </li>
                ))}
              </ul>
              {d.hours !== 24 ? <p className="text-[10px] text-warning">{d.hours} h day (clocks change)</p> : null}
            </div>
          ))}
        </div>
        <p className="text-xs text-taupe-strong">Green = workouts, amber = needs confirmation, tinted orange = suggested drinks (✓ = in your plan). Overlapping events are merged when counting busy time.</p>
      </section>

      <ExposureBeacon ids={proposed.map((r) => r.id)} />

      {/* Day by day (agenda-first on mobile) */}
      <section aria-labelledby="days-h" className="space-y-6">
        <h2 id="days-h" className="eyebrow">Day by day</h2>
        {v.days.map((d) => (
          <article key={d.date} id={d.date} className={cn("space-y-3 rounded-[var(--radius-lg)] border border-line p-4 sm:p-5", d.isToday ? "bg-surface" : "bg-transparent", d.isPast && "opacity-70")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-2xl">{d.label}{d.isToday ? <Badge tone="demo" className="ml-2 align-middle">Today</Badge> : null}</h3>
              <p className="text-xs text-taupe-strong">
                {d.busyHours} h occupied{d.busyDay ? " · busy day" : ""}{d.hours !== 24 ? ` · ${d.hours}-hour day (daylight saving)` : ""}
              </p>
            </div>
            <Agenda items={d.agenda} dense empty="Nothing on your calendar." />
            {d.recs.map((r) => <RecCard key={r.id} state={state} rec={r} now={now} compact className="bg-cream" />)}
            {d.completed.map((r) => (
              <p key={r.id} className="text-sm text-taupe-strong">✓ Had {getProduct(state, r.flavor).name} at {formatTime(Date.parse(r.completedAt ?? r.startUtc), tz)}</p>
            ))}
            {d.withdrawn.map((r) => (
              <Callout key={r.id} tone="warning" title={`Withdrawn: ${getProduct(state, r.flavor).name} at ${formatTime(Date.parse(r.startUtc), tz)}`}>{r.conflict?.message}</Callout>
            ))}
            {d.recs.length === 0 && d.note && d.note.messages.length > 0 && !d.isPast ? (
              <p className="text-sm text-taupe-strong">No suggestion: {d.note.messages[0]}</p>
            ) : null}
          </article>
        ))}
      </section>

      <AdjustWeek
        examples={NL_EXAMPLES}
        aiLabel={ai.label}
        recent={state.prefChanges.slice(0, 4).map((c) => ({ id: c.id, summary: c.summary, undone: Boolean(c.undoneAt) }))}
      />
    </div>
  );
}
