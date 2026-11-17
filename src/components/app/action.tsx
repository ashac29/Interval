"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogClose, DialogTrigger } from "@/components/ui/dialog";

export type Res = { ok: true; message: string } | { ok: false; error: string };

/** Runs a server action in a transition and reports the result consistently (toast success / toast error). */
export function useRun() {
  const [pending, start] = React.useTransition();
  const run = React.useCallback((fn: () => Promise<Res>, opts?: { onOk?: (r: Res) => void; silent?: boolean }) => {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (!opts?.silent) toast.success(r.message);
          opts?.onOk?.(r);
        } else toast.error(r.error);
      } catch {
        toast.error("That didn’t go through. Nothing was changed — please try again.");
      }
    });
  }, []);
  return { pending, run };
}

export function ActionButton({ action, children, pendingLabel, onOk, ...props }: Omit<ButtonProps, "onClick"> & { action: () => Promise<Res>; pendingLabel?: string; onOk?: (r: Res) => void }) {
  const { pending, run } = useRun();
  return (
    <Button {...props} disabled={pending || props.disabled} aria-busy={pending} onClick={() => run(action, { onOk })}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** Button that asks for explicit confirmation first (shipment changes, deletions, anything material). */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  tone = "primary",
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<Res>;
  tone?: "primary" | "danger" | "accent";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant={tone} disabled={pending} aria-busy={pending} onClick={() => run(action, { onOk: () => setOpen(false) })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
