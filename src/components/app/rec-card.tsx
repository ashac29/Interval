import { ChevronDown } from "lucide-react";
import { Can } from "@/components/brand/can";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import { caffeineLabel, getProduct } from "@/lib/domain/catalog";
import { formatDayShort } from "@/lib/domain/time";
import type { AppState, Recommendation } from "@/lib/domain/types";
import { flavorOptions, recLite, timeLabel } from "@/lib/rec-view";
import { RecControls } from "./rec-controls";

const KIND: Record<Recommendation["kind"], string> = { post_workout: "After workout", pre_workout: "Before workout", busy_gap: "Open gap" };

/** "Why this suggestion?" — reasons, scoring terms and versions, so every suggestion is explainable. */
export function WhyThis({ rec }: { rec: Recommendation }) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-line bg-cream/60 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 font-medium">
        Why this suggestion?
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-line px-3.5 py-3">
        <p>{rec.reason}</p>
        <ul className="space-y-1">
          {rec.score.parts.map((p) => (
            <li key={p.code} className="flex justify-between gap-3 text-taupe-strong">
              <span>{p.label}</span>
              <span className="tabular font-medium text-espresso">{p.value > 0 ? "+" : ""}{p.value}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-line pt-1 font-medium">
            <span>Ranking score</span>
            <span className="tabular">{rec.score.total}</span>
          </li>
        </ul>
        <p className="text-xs text-taupe-strong">
          Checked by policy {rec.policyVersion} · ranked with {rec.scoringVersion}. Items marked &ldquo;inferred&rdquo; come from your past choices and never override your explicit settings. This is a convenience suggestion, not a meal replacement or health advice.
        </p>
      </div>
    </details>
  );
}

export function RecCard({ state, rec, now, showDate = false, compact = false, className }: { state: AppState; rec: Recommendation; now: Date; showDate?: boolean; compact?: boolean; className?: string }) {
  const p = getProduct(state, rec.flavor);
  return (
    <article className={cn("rounded-[var(--radius-lg)] border border-line bg-surface p-4", rec.status === "accepted" && "border-espresso/60", className)} aria-label={`${p.name} suggestion`}>
      <div className="flex gap-4">
        <div className="w-10 shrink-0 sm:w-12">
          <Can flavor={rec.flavor} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl leading-tight sm:text-2xl">
              {showDate ? `${formatDayShort(rec.localDate)}, ` : ""}
              {timeLabel(state, rec)} · {p.name}
            </p>
            <Badge tone={rec.status === "accepted" ? "live" : "neutral"}>{rec.status === "accepted" ? "In your plan" : "Suggested"}</Badge>
          </div>
          <p className="text-sm text-taupe-strong">
            {KIND[rec.kind]} · {caffeineLabel(rec.caffeine)}
          </p>
          {!compact ? <p className="max-w-prose text-sm">{rec.reason}</p> : null}
        </div>
      </div>
      {rec.conflict ? (
        <Callout tone="warning" className="mt-3" title="Needs a look">
          {rec.conflict.message}
        </Callout>
      ) : null}
      <div className="mt-4">
        <RecControls rec={recLite(state, rec)} options={flavorOptions(state, rec, now)} compact={compact} />
      </div>
      <div className="mt-3">
        <WhyThis rec={rec} />
      </div>
    </article>
  );
}
