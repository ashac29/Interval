import { Can } from "@/components/brand/can";
import { Wordmark } from "@/components/brand/wordmark";

/** Static, honest preview of the Today screen using demo data. Not interactive. */
export function AppPreview() {
  const rows = [
    { t: "6:30", e: "Strength training", tone: "workout" },
    { t: "7:50", e: "Matcha — suggested", tone: "drink" },
    { t: "9:30", e: "Quarterly planning", tone: "busy" },
    { t: "1:00", e: "Customer workshop", tone: "busy" },
  ];
  return (
    <figure className="mx-auto w-full max-w-[22rem]">
      <div className="overflow-hidden rounded-[2.2rem] border border-espresso/80 bg-cream p-3 shadow-[var(--shadow-lift)]" role="img" aria-label="Preview of the Today screen showing a post-workout matcha suggestion at 7:50 AM on a packed day">
        <div className="rounded-[1.7rem] border border-line bg-cream p-4">
          <div className="flex items-center justify-between">
            <Wordmark size="sm" />
            <span className="rounded-full bg-[#f6e3cf] px-2 py-0.5 text-[10px] font-medium text-burnt-ink">Demo data</span>
          </div>
          <p className="eyebrow mt-5">Tuesday</p>
          <p className="font-display text-[2rem] leading-[1.02]">Packed day ahead.</p>
          <p className="mt-1 text-xs text-taupe-strong">A workout and about 7 hours of events.</p>
          <div className="mt-4 grid grid-cols-[3.2rem_1fr] gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3">
            <Can flavor="matcha" />
            <div className="space-y-1.5">
              <p className="tabular font-display text-3xl leading-none">7:50 AM</p>
              <p className="text-xs">Matcha · after your workout</p>
              <p className="text-[11px] leading-snug text-taupe-strong">First open window after your 7:30 finish, before the 9:30 block.</p>
              <span aria-hidden className="mt-1 inline-flex h-8 items-center rounded-full bg-burnt px-4 text-xs font-medium text-cream">Had one</span>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line text-xs">
            {rows.map((r) => (
              <li key={r.t + r.e} className="grid grid-cols-[3rem_1fr] gap-2 py-2">
                <span className="tabular text-taupe-strong">{r.t}</span>
                <span className={r.tone === "drink" ? "font-medium text-burnt-ink" : r.tone === "workout" ? "font-medium" : "text-taupe-strong"}>{r.e}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-taupe-strong">Illustrative preview with demo data.</figcaption>
    </figure>
  );
}
