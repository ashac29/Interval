import { policy } from "@/config/policy";
import type { DayTally } from "@/lib/domain/validate";

/** Tracked caffeine, honestly labeled. Unknown amounts are never counted as zero. */
export function trackedLabel(t: DayTally): string {
  return t.hasUnknown ? `at least ${t.trackedMg} mg tracked (some amounts unknown)` : `${t.trackedMg} mg tracked caffeine`;
}

export function CaffeineGuidance({ demo }: { demo?: boolean }) {
  const g = policy.caffeine.guidance;
  return (
    <p className="text-xs leading-relaxed text-taupe-strong">
      Not individual medical advice and not a target. {g.summary} Source:{" "}
      <a className="underline underline-offset-2" href={g.url} target="_blank" rel="noreferrer noopener">
        {g.label}
      </a>
      {g.urlNeedsVerification ? " (link goes to the publisher; verify the exact page before launch)" : ""}.
      {demo ? " Demo caffeine values per can are illustrative, not measured." : ""}
    </p>
  );
}
