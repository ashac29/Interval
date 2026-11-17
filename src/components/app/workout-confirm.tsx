"use client";
import * as React from "react";
import { Dumbbell } from "lucide-react";
import { confirmWorkoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useRun } from "./action";

const TYPES = ["workout", "strength", "run", "yoga", "pilates", "cycling", "swim", "hiit", "climbing"];

/** Ask before using an uncertain event for workout-specific suggestions. Titles are shown as plain text only. */
export function WorkoutConfirm({ eventKey, title, when, reason, confidence }: { eventKey: string; title: string; when: string; reason: string; confidence?: number }) {
  const [type, setType] = React.useState("workout");
  const [remember, setRemember] = React.useState(true);
  const { pending, run } = useRun();
  return (
    <div className="rounded-[var(--radius-lg)] border border-warning/40 bg-warning-tint p-4">
      <div className="flex items-start gap-3">
        <Dumbbell className="mt-1 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium">
              Is &ldquo;<span className="break-words">{title}</span>&rdquo; a workout?
            </p>
            <p className="text-sm text-taupe-strong">
              {when} · {reason}
              {confidence !== undefined ? ` (${Math.round(confidence * 100)}% sure)` : ""} It won&rsquo;t be used for workout-specific suggestions until you confirm. A calendar event isn&rsquo;t proof a workout happened.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="sr-only" htmlFor={`type-${eventKey}`}>
              Workout type
            </label>
            <Select id={`type-${eventKey}`} value={type} onChange={(e) => setType(e.target.value)} className="h-9 min-h-9 w-36 py-0 text-sm">
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-burnt)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember for this title
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => confirmWorkoutAction(eventKey, true, type, remember))}>
              Yes, it&rsquo;s a workout
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => confirmWorkoutAction(eventKey, false, null, remember))}>
              Not a workout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
