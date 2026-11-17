import type { Flavor } from "@/config/products";
import { cn } from "@/lib/utils";

const FILL: Record<Flavor, string> = { chai: "var(--color-chai)", oolong: "var(--color-oolong)", matcha: "var(--color-matcha)" };
const INK: Record<Flavor, string> = { chai: "var(--color-chai-ink)", oolong: "var(--color-oolong-ink)", matcha: "var(--color-matcha-ink)" };
const NAME: Record<Flavor, string> = { chai: "CHAI", oolong: "OOLONG", matcha: "MATCHA" };

/**
 * Local, consistent can illustration (12 fl oz). Pure SVG so nothing remote can break.
 * Flat fills only: body in the flavor accent, cream label type, lid in a neutral.
 */
export function Can({ flavor, className, title }: { flavor: Flavor; className?: string; title?: string }) {
  const id = `can-${flavor}`;
  return (
    <svg viewBox="0 0 120 240" role="img" aria-label={title ?? `${NAME[flavor].toLowerCase()} can`} className={cn("h-auto w-full", className)}>
      <title>{title ?? `interval ${flavor}, 12 oz can`}</title>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d="M14 30h92v176c0 9-6 16-14 16H28c-8 0-14-7-14-16Z" />
        </clipPath>
      </defs>
      {/* ground shadow */}
      <ellipse cx="60" cy="230" rx="38" ry="5" fill="var(--color-espresso)" opacity="0.1" />
      {/* body */}
      <path d="M14 30h92v176c0 9-6 16-14 16H28c-8 0-14-7-14-16Z" fill={FILL[flavor]} />
      <g clipPath={`url(#${id}-body)`}>
        {/* form highlight + shade (flat bands, no gradients) */}
        <rect x="22" y="30" width="9" height="196" fill="var(--color-cream)" opacity="0.16" />
        <rect x="92" y="30" width="14" height="196" fill="var(--color-espresso)" opacity="0.12" />
        {/* label field */}
        <rect x="14" y="70" width="92" height="122" fill={INK[flavor]} opacity="0.92" />
        <rect x="14" y="70" width="92" height="2" fill="var(--color-cream)" opacity="0.5" />
        <rect x="14" y="190" width="92" height="2" fill="var(--color-cream)" opacity="0.5" />
      </g>
      {/* lid */}
      <path d="M14 30c0-5 4-8 9-8h74c5 0 9 3 9 8v8H14Z" fill="var(--color-line)" />
      <rect x="14" y="36" width="92" height="3" fill="var(--color-taupe)" opacity="0.35" />
      <rect x="44" y="24" width="32" height="6" rx="3" fill="var(--color-cream-deep)" />
      {/* type */}
      <text x="60" y="116" textAnchor="middle" fill="var(--color-cream)" style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.04em", fontWeight: 500 }}>
        interval
      </text>
      <text x="60" y="140" textAnchor="middle" fill="var(--color-cream)" style={{ fontFamily: "var(--font-sans)", fontSize: 8.5, letterSpacing: "0.22em", fontWeight: 700 }}>
        {NAME[flavor]}
      </text>
      <rect x="40" y="152" width="40" height="1" fill="var(--color-cream)" opacity="0.6" />
      <text x="60" y="168" textAnchor="middle" fill="var(--color-cream)" style={{ fontFamily: "var(--font-sans)", fontSize: 7, letterSpacing: "0.12em", fontWeight: 500 }}>
        20G PROTEIN
      </text>
      <text x="60" y="180" textAnchor="middle" fill="var(--color-cream)" opacity="0.8" style={{ fontFamily: "var(--font-sans)", fontSize: 6, letterSpacing: "0.12em" }}>
        12 FL OZ
      </text>
    </svg>
  );
}

export function CanTrio({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end justify-center gap-3 sm:gap-5", className)} aria-hidden>
      <Can flavor="chai" className="w-[28%] translate-y-2 -rotate-3" />
      <Can flavor="oolong" className="w-[32%]" />
      <Can flavor="matcha" className="w-[28%] translate-y-2 rotate-3" />
    </div>
  );
}

export function FlavorDot({ flavor, className }: { flavor: Flavor; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 rounded-full", className)} style={{ background: FILL[flavor] }} />;
}
