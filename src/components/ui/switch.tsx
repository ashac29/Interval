"use client";
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-field bg-cream-deep transition-colors data-[state=checked]:border-espresso data-[state=checked]:bg-espresso disabled:opacity-50", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-1 rounded-full bg-surface shadow ring-1 ring-field/40 transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:ring-0" />
    </SwitchPrimitive.Root>
  );
}
