import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-line bg-info-tint text-espresso", icon: Info, label: "Note" },
  success: { box: "border-success/40 bg-success-tint text-espresso", icon: CheckCircle2, label: "Success" },
  warning: { box: "border-warning/40 bg-warning-tint text-espresso", icon: AlertTriangle, label: "Heads up" },
  error: { box: "border-danger/40 bg-danger-tint text-espresso", icon: XCircle, label: "Problem" },
  demo: { box: "border-burnt/40 bg-[#f6e3cf] text-espresso", icon: Info, label: "Demo" },
} as const;

export function Callout({ tone = "info", title, children, className, action }: { tone?: keyof typeof tones; title?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-[var(--radius-md)] border p-3.5 text-sm", t.box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : <span className="sr-only">{t.label}</span>}
        {children ? <div className="text-taupe-strong [&_a]:underline">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-dashed border-line bg-transparent p-6", className)}>
      <p className="font-display text-xl">{title}</p>
      {children ? <div className="max-w-prose text-sm text-taupe-strong">{children}</div> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse-soft rounded-[var(--radius-md)] bg-cream-deep", className)} />;
}
