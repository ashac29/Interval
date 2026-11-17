"use client";
import * as React from "react";
import { Coffee, Plus, Undo2 } from "lucide-react";
import { addExternalCaffeine, logAdHoc, removeExternalCaffeine, undoLog } from "@/app/actions";
import { EXTERNAL_CAFFEINE_PRESETS, FLAVORS, type Flavor } from "@/config/products";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { ActionButton, useRun } from "./action";

const NAMES: Record<Flavor, string> = { chai: "Chai", oolong: "Oolong", matcha: "Matcha" };

export function LogDrinkDialog({ stock }: { stock: Record<Flavor, number> }) {
  const [open, setOpen] = React.useState(false);
  const key = React.useRef<string | null>(null);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus aria-hidden /> Log a drink
        </Button>
      </DialogTrigger>
      <DialogContent title="Log a drink" description="For a drink that wasn't suggested. Logging is always truthful, even past your daily limit; it just stops further suggestions.">
        <ul className="flex flex-col gap-2">
          {FLAVORS.map((f) => (
            <li key={f}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => logAdHoc(f, `${(key.current ??= crypto.randomUUID())}-${f}`), {
                    onOk: () => {
                      setOpen(false);
                      key.current = null;
                    },
                  })
                }
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-left hover:bg-cream-deep"
              >
                <span className="font-medium">{NAMES[f]}</span>
                <span className="text-xs text-taupe-strong">{stock[f]} logged in stock</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function LogCaffeineDialog() {
  const [open, setOpen] = React.useState(false);
  const [preset, setPreset] = React.useState<string>("coffee");
  const [custom, setCustom] = React.useState("");
  const { pending, run } = useRun();
  const p = EXTERNAL_CAFFEINE_PRESETS.find((x) => x.id === preset) ?? EXTERNAL_CAFFEINE_PRESETS[0]!;
  const customNum = custom.trim() === "" ? null : Number(custom);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Coffee aria-hidden /> Log other caffeine
        </Button>
      </DialogTrigger>
      <DialogContent title="Log other caffeine" description="Quick entry so your tracked total is complete. Preset amounts are typical estimates; use your own number if you know it.">
        <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <legend className="sr-only">What did you have?</legend>
          {EXTERNAL_CAFFEINE_PRESETS.map((x) => (
            <label key={x.id} className={cn("flex cursor-pointer flex-col rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-burnt", preset === x.id ? "border-espresso bg-cream-deep" : "border-line bg-surface")}>
              <input type="radio" name="preset" className="sr-only" checked={preset === x.id} onChange={() => setPreset(x.id)} />
              <span className="font-medium">{x.label}</span>
              <span className="text-xs text-taupe-strong">{x.mg === null ? "Amount unknown" : `~${x.mg} mg · ${x.note}`}</span>
            </label>
          ))}
        </fieldset>
        {p.mg !== null ? (
          <Field label="Or enter your own amount (mg)" htmlFor="custom-mg" hint="Leave blank to use the estimate above.">
            <Input id="custom-mg" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(p.mg)} />
          </Field>
        ) : (
          <p className="text-sm text-taupe-strong">Unknown amounts are never counted as zero. Suggestions pause for the day because the total can&rsquo;t be verified.</p>
        )}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={pending} onClick={() => run(() => addExternalCaffeine(p.label, p.mg === null ? null : (customNum ?? p.mg)), { onOk: () => setOpen(false) })}>
            Log it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UndoLogButton({ id, label = "Undo" }: { id: string; label?: string }) {
  return (
    <ActionButton variant="ghost" size="sm" action={() => undoLog(id)}>
      <Undo2 aria-hidden /> {label}
    </ActionButton>
  );
}

export function RemoveCaffeineButton({ id }: { id: string }) {
  return (
    <ActionButton variant="ghost" size="sm" action={() => removeExternalCaffeine(id)}>
      Remove
    </ActionButton>
  );
}
