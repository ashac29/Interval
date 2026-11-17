"use client";
import { FileText } from "lucide-react";
import { generateBriefAction } from "@/app/actions";
import { ActionButton } from "./action";

export interface BriefLite {
  headline: string;
  paragraphs: string[];
  source: "deterministic" | "mock_llm" | "llm";
  stale: boolean;
}

const SRC = { deterministic: "Written directly from your plan", mock_llm: "Demo AI (deterministic mock)", llm: "Written by AI from your validated plan" } as const;

export function BriefCard({ brief }: { brief: BriefLite | null }) {
  return (
    <section aria-labelledby="brief-h" className="space-y-3 rounded-[var(--radius-xl)] border border-line bg-cream-deep p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="brief-h" className="flex items-center gap-2 text-2xl">
          <FileText className="size-5 text-burnt" aria-hidden /> Weekly brief
        </h2>
        <ActionButton size="sm" variant={brief ? "outline" : "primary"} action={generateBriefAction}>
          {brief ? "Refresh brief" : "Write my brief"}
        </ActionButton>
      </div>
      {brief ? (
        <div className="space-y-2">
          <p className="font-display text-xl">{brief.headline}</p>
          {brief.paragraphs.map((p) => (
            <p key={p} className="max-w-prose text-sm">{p}</p>
          ))}
          <p className="text-xs text-taupe-strong">
            {SRC[brief.source]}. It only describes your actual workouts, busy days and suggestions.{brief.stale ? " Your plan changed since this was written; refresh to update." : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-taupe-strong">A short summary of your actual workouts, busy days and suggested drinks for the week. It never invents events, stock or shipments.</p>
      )}
    </section>
  );
}
