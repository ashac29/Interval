"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-espresso/45 data-[state=open]:animate-fade" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto border border-line bg-cream p-6 shadow-[var(--shadow-lift)] data-[state=open]:animate-rise",
          "bottom-0 left-0 rounded-t-[var(--radius-xl)] sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-xl)]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <DialogPrimitive.Title className="font-display text-2xl">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="text-sm text-taupe-strong">{description}</DialogPrimitive.Description> : null}
          </div>
          <DialogPrimitive.Close className="rounded-full p-2 text-taupe-strong hover:bg-cream-deep" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
