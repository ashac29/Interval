"use client";
import * as React from "react";
import { Check, Clock, Leaf, RotateCcw, X } from "lucide-react";
import { acceptRec, ackConflict, changeFlavor, dismissRec, hadOne, rescheduleRec, undoAcceptRec } from "@/app/actions";
import { DISMISS_REASONS, type DismissReason } from "@/lib/domain/types";
import type { Flavor } from "@/config/products";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { ActionButton, useRun } from "./action";

export interface RecLite {
  id: string;
  status: "proposed" | "accepted";
  flavor: Flavor;
  date: string;
  hhmm: string;
  hasConflict: boolean;
}
export interface FlavorOption {
  flavor: Flavor;
  name: string;
  stock: number;
  blocked: string | null; // reason a flavor can't be chosen (policy), if any
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export function HadOneButton({ recId, size = "lg", label = "Had one" }: { recId: string; size?: "sm" | "md" | "lg"; label?: string }) {
  const key = React.useRef(newKey());
  const { pending, run } = useRun();
  return (
    <Button
      size={size}
      variant="accent"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        run(() => hadOne(recId, key.current), {
          onOk: () => {
            key.current = newKey();
          },
        })
      }
    >
      <Check aria-hidden /> {pending ? "Logging…" : label}
    </Button>
  );
}

function ChangeTime({ rec }: { rec: RecLite }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(rec.hhmm);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock aria-hidden /> Change time
        </Button>
      </DialogTrigger>
      <DialogContent title="Change time" description="Pick a time that works. It’s checked against your cutoff, quiet hours, caffeine ceiling and daily limit.">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Time (planning timezone)
          <Input type="time" value={value} onChange={(e) => setValue(e.target.value)} required />
        </label>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={pending || !value} onClick={() => run(() => rescheduleRec(rec.id, rec.date, value), { onOk: () => setOpen(false) })}>
            Save time
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeFlavor({ rec, options }: { rec: RecLite; options: FlavorOption[] }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Leaf aria-hidden /> Change flavor
        </Button>
      </DialogTrigger>
      <DialogContent title="Change flavor" description="Only flavors that pass your limits and have stock can be chosen.">
        <ul className="flex flex-col gap-2">
          {options.map((o) => {
            const current = o.flavor === rec.flavor;
            const disabled = Boolean(o.blocked) && !current;
            return (
              <li key={o.flavor}>
                <button
                  type="button"
                  disabled={disabled || pending || current}
                  onClick={() => run(() => changeFlavor(rec.id, o.flavor), { onOk: () => setOpen(false) })}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left", current ? "border-espresso bg-cream-deep" : "border-line bg-surface hover:bg-cream-deep", disabled && "opacity-55")}
                >
                  <span className="font-medium">{o.name}</span>
                  <span className="text-xs text-taupe-strong">{current ? "Current" : (o.blocked ?? `${o.stock} in stock`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function Dismiss({ rec }: { rec: RecLite }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<DismissReason | null>(null);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <X aria-hidden /> Dismiss
        </Button>
      </DialogTrigger>
      <DialogContent title="Dismiss this suggestion" description="Tell us why so suggestions improve. A skipped workout won’t change your timing preferences.">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Reason</legend>
          {DISMISS_REASONS.map((r) => (
            <label key={r.id} className={cn("flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-burnt", reason === r.id ? "border-espresso bg-cream-deep" : "border-line bg-surface")}>
              <input type="radio" name="reason" className="accent-[var(--color-burnt)]" checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Keep it</Button>
          </DialogClose>
          <Button disabled={!reason || pending} onClick={() => reason && run(() => dismissRec(rec.id, reason), { onOk: () => setOpen(false) })}>
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Full control set for a suggestion. `compact` hides the primary action (Plan view). */
export function RecControls({ rec, options, compact = false }: { rec: RecLite; options: FlavorOption[]; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact && <HadOneButton recId={rec.id} />}
      {rec.status === "proposed" ? (
        <ActionButton variant={compact ? "primary" : "subtle"} size="sm" action={() => acceptRec(rec.id)} pendingLabel="Adding…">
          <Check aria-hidden /> Add to plan
        </ActionButton>
      ) : (
        <ActionButton variant="subtle" size="sm" action={() => undoAcceptRec(rec.id)}>
          <RotateCcw aria-hidden /> Undo accept
        </ActionButton>
      )}
      <ChangeTime rec={rec} />
      <ChangeFlavor rec={rec} options={options} />
      <Dismiss rec={rec} />
      {rec.hasConflict ? (
        <ActionButton variant="ghost" size="sm" action={() => ackConflict(rec.id)}>
          Keep as is
        </ActionButton>
      ) : null}
    </div>
  );
}
