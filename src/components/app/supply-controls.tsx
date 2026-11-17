"use client";
import * as React from "react";
import { acceptReplen, advanceShipment, cancelSub, confirmShipment, confirmTrialDelivery, delayShipment, dismissReplen, pauseSub, resumeSub, setStock, skipShipment, updateMix } from "@/app/actions";
import { FLAVORS, type Flavor } from "@/config/products";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { ActionButton, ConfirmAction, useRun } from "./action";

const NAMES: Record<Flavor, string> = { chai: "Chai", oolong: "Oolong", matcha: "Matcha" };

export function StockEditor({ flavor, count }: { flavor: Flavor; count: number }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(String(count));
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Correct count</Button>
      </DialogTrigger>
      <DialogContent title={`Correct ${NAMES[flavor]} stock`} description="Set the number of cans you actually have. This is recorded as a manual correction.">
        <Field label="Cans on hand" htmlFor={`stk-${flavor}`}>
          <Input id={`stk-${flavor}`} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button disabled={pending || val === ""} onClick={() => run(() => setStock(flavor, Number(val)), { onOk: () => setOpen(false) })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReplenishCard({ id, title, detail }: { id: string; title: string; detail: string }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-burnt/40 bg-[#f6e3cf] p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-taupe-strong">{detail}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ConfirmAction trigger={<Button size="sm" variant="accent">Review &amp; confirm</Button>} title={title} description="Your shipment changes only if you confirm. No real charge or delivery is involved." confirmLabel="Yes, change it" tone="accent" action={() => acceptReplen(id)} />
        <ActionButton size="sm" variant="ghost" action={() => dismissReplen(id)}>Not now</ActionButton>
      </div>
    </div>
  );
}

export function ConfirmDeliveryButton({ kind, id }: { kind: "shipment" | "order"; id: string }) {
  return (
    <ConfirmAction
      trigger={<Button size="sm" variant="outline">Mark delivered</Button>}
      title="Confirm this delivery"
      description="Simulated: nothing really shipped. Confirming adds these cans to your logged stock."
      confirmLabel="Add to stock"
      action={() => (kind === "shipment" ? confirmShipment(id) : confirmTrialDelivery(id))}
    />
  );
}

export function SubscriptionControls({ status, nextDate, mix, cans, minAdvance, delays, today }: { status: "active" | "paused"; nextDate: string | null; mix: Record<Flavor, number>; cans: number; minAdvance: string; delays: number[]; today: string }) {
  const [date, setDate] = React.useState(minAdvance);
  const [resumeDate, setResumeDate] = React.useState(minAdvance);
  const [m, setM] = React.useState(mix);
  const total = FLAVORS.reduce((s, f) => s + m[f], 0);
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" ? (
        <>
          <ConfirmAction trigger={<Button size="sm" variant="outline">Skip next</Button>} title="Skip the next shipment?" description={`Simulated: the ${nextDate ?? ""} shipment is skipped and the following one is scheduled a month later. Nothing is charged.`} confirmLabel="Skip it" action={skipShipment} />
          <ConfirmAction trigger={<Button size="sm" variant="outline">Advance</Button>} title="Move the next shipment earlier" description="Pick a date after today and before the current shipment date." confirmLabel="Move it up" action={() => advanceShipment(date)}>
            <Field label="New date" htmlFor="adv"><Input id="adv" type="date" min={minAdvance} max={nextDate ?? undefined} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </ConfirmAction>
          <Dialog>
            <DialogTrigger asChild><Button size="sm" variant="outline">Delay</Button></DialogTrigger>
            <DialogContent title="Delay the next shipment" description="Choose how long to push it back.">
              <div className="flex flex-wrap gap-2">
                {delays.map((d) => (
                  <ConfirmAction key={d} trigger={<Button variant="subtle">{d} days</Button>} title={`Delay by ${d} days?`} description="Simulated: only the date changes. Nothing is charged." confirmLabel="Delay" action={() => delayShipment(d)} />
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <ConfirmAction trigger={<Button size="sm" variant="outline">Pause</Button>} title="Pause your subscription?" description="Simulated: no shipments are scheduled while paused. You can resume with a date you choose." confirmLabel="Pause" action={pauseSub} />
        </>
      ) : (
        <ConfirmAction trigger={<Button size="sm" variant="accent">Resume</Button>} title="Resume your subscription" description="Choose when the next simulated shipment should go out." confirmLabel="Resume" tone="accent" action={() => resumeSub(resumeDate)}>
          <Field label="First shipment" htmlFor="res"><Input id="res" type="date" min={minAdvance} value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} /></Field>
        </ConfirmAction>
      )}
      <Dialog>
        <DialogTrigger asChild><Button size="sm" variant="outline">Edit mix</Button></DialogTrigger>
        <DialogContent title="Edit your mix" description={`Exactly ${cans} cans per shipment. Applies to upcoming shipments only.`}>
          <div className="space-y-2">
            {FLAVORS.map((f) => (
              <div key={f} className="flex items-center justify-between gap-3">
                <span className="font-medium">{NAMES[f]}</span>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" aria-label={`Fewer ${f}`} onClick={() => setM({ ...m, [f]: Math.max(0, m[f] - 1) })}>−</Button>
                  <span className="tabular w-8 text-center">{m[f]}</span>
                  <Button size="icon" variant="outline" aria-label={`More ${f}`} onClick={() => setM({ ...m, [f]: m[f] + 1 })}>+</Button>
                </div>
              </div>
            ))}
            <p className={total === cans ? "text-sm text-success" : "text-sm text-danger"}>{total} of {cans} cans</p>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button disabled={total !== cans || pending} onClick={() => run(() => updateMix(m))}>Save mix</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmAction trigger={<Button size="sm" variant="ghost">Cancel subscription</Button>} title="Cancel your subscription?" description="Simulated: scheduled shipments are removed. You can start a new one from Shop." confirmLabel="Cancel subscription" tone="danger" action={cancelSub} />
      <span className="sr-only">Today is {today}</span>
    </div>
  );
}
