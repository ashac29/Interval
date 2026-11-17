import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-line bg-cream-deep text-taupe-strong",
      demo: "border-burnt/40 bg-[#f6e3cf] text-burnt-ink",
      live: "border-success/40 bg-success-tint text-success",
      warn: "border-warning/40 bg-warning-tint text-warning",
      danger: "border-danger/40 bg-danger-tint text-danger",
      chai: "border-chai/40 bg-chai-tint text-chai-ink",
      oolong: "border-oolong/40 bg-oolong-tint text-oolong-ink",
      matcha: "border-matcha/40 bg-matcha-tint text-matcha-ink",
      outline: "border-field text-espresso",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
