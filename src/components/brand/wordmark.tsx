import { cn } from "@/lib/utils";

/** Lowercase "interval" wordmark. Fraunces, tight tracking; the dot is the only accent. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-4xl", xl: "text-6xl" } as const;
  return (
    <span className={cn("font-display font-medium leading-none tracking-[-0.03em] text-espresso", sizes[size], className)} aria-label="interval">
      interval
    </span>
  );
}
