import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgendaItem } from "@/lib/views";

/** Agenda as a quiet timeline. Titles are rendered as plain text (never as markup or instructions). */
export function Agenda({ items, empty = "Nothing on your calendar.", dense = false }: { items: AgendaItem[]; empty?: string; dense?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-taupe-strong">{empty}</p>;
  return (
    <ol className="relative space-y-0">
      {items.map((e) => (
        <li key={e.key} className={cn("grid grid-cols-[4.5rem_1fr] gap-3 border-t border-line first:border-t-0", dense ? "py-2" : "py-3")}>
          <div className="tabular text-sm text-taupe-strong">
            <p className="text-espresso">{e.start}</p>
            {e.start !== "All day" ? <p>{e.end}</p> : null}
          </div>
          <div className="min-w-0 space-y-1">
            <p className={cn("break-words font-medium", e.kind === "excluded" && "text-taupe-strong line-through decoration-taupe/50")}>{e.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-taupe-strong">
              <span>{e.calendar}</span>
              {e.recurring ? (
                <span className="inline-flex items-center gap-1">
                  <Repeat className="size-3" aria-hidden /> recurring
                </span>
              ) : null}
              {e.kind === "workout" ? <Badge tone="live">{e.workoutType} · {e.confirmed ? "confirmed" : "detected"}</Badge> : null}
              {e.kind === "needs_confirmation" ? <Badge tone="warn">Confirm: workout?</Badge> : null}
              {e.kind === "excluded" ? <Badge>{e.excludedReason}</Badge> : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
