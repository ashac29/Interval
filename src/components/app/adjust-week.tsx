"use client";
import * as React from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { confirmPrefProposal, discardPrefProposal, previewPrefText, undoPrefChangeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Textarea } from "@/components/ui/field";
import { weekdayName } from "@/lib/domain/time";
import type { PrefProposal } from "@/lib/domain/prefs-nl";
import { ActionButton, useRun } from "./action";

type Result = (PrefProposal & { pendingId?: string | null }) | { kind: "error"; error: string } | null;

export function AdjustWeek({ examples, recent, aiLabel }: { examples: string[]; recent: { id: string; summary: string; undone: boolean }[]; aiLabel: string }) {
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<Result>(null);
  const [days, setDays] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const { pending, run } = useRun();

  async function ask(officeDays?: number[]) {
    setBusy(true);
    try {
      setResult((await previewPrefText(text, officeDays)) as Result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="adjust-h" className="space-y-4 rounded-[var(--radius-xl)] border border-line bg-surface p-5 sm:p-6">
      <div className="space-y-1">
        <h2 id="adjust-h" className="flex items-center gap-2 text-2xl">
          <Sparkles className="size-5 text-burnt" aria-hidden /> Adjust my week
        </h2>
        <p className="text-sm text-taupe-strong">Say it in your own words. You&rsquo;ll see a before/after preview and nothing changes until you confirm. Understood by: {aiLabel}.</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="nl" className="sr-only">
          Describe a preference change
        </label>
        <Textarea id="nl" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. No reminders before 8" />
        <div className="flex flex-wrap gap-2">
          {examples.map((x) => (
            <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs hover:bg-cream-deep">
              {x}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={busy || text.trim().length < 3}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Preview change
        </Button>
      </form>

      {result?.kind === "preview" ? (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-espresso/40 bg-cream p-4" aria-live="polite">
          <p className="font-medium">Here&rsquo;s what would change</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-taupe-strong">
              <tr>
                <th className="py-1 pr-2 font-medium">Setting</th>
                <th className="py-1 pr-2 font-medium">Before</th>
                <th className="py-1 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {result.diff.map((d) => (
                <tr key={d.label} className="border-t border-line align-top">
                  <td className="py-2 pr-2">{d.label}</td>
                  <td className="py-2 pr-2 text-taupe-strong">{d.before}</td>
                  <td className="py-2 font-medium">{d.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                run(() => confirmPrefProposal((result as { pendingId: string }).pendingId), {
                  onOk: () => {
                    setResult(null);
                    setText("");
                  },
                })
              }
            >
              Apply change
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => discardPrefProposal(), { onOk: () => setResult(null), silent: true })}>
              Not what I meant
            </Button>
          </div>
        </div>
      ) : null}
      {result?.kind === "clarify" && result.needs === "office_days" ? (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-line bg-cream p-4">
          <p className="font-medium">{result.question}</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm has-[:checked]:border-espresso has-[:checked]:bg-cream-deep has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-burnt">
                <input type="checkbox" className="sr-only" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />
                {weekdayName(d, false)}
              </label>
            ))}
          </div>
          <Button disabled={days.length === 0 || busy} onClick={() => void ask(days)}>
            Continue
          </Button>
        </div>
      ) : null}
      {result?.kind === "clarify" && result.needs === "choice" ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-line bg-cream p-4">
          <p className="font-medium">{result.question}</p>
          <div className="flex flex-wrap gap-2">
            {result.options.map((o) => (
              <Button key={o} size="sm" variant="outline" onClick={() => setText(o)}>
                {o}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {result?.kind === "unsupported" ? <Callout tone="info" title="I can’t change that">{result.reason}</Callout> : null}
      {result?.kind === "rejected" ? <Callout tone="warning" title="That conflicts with product limits">{result.reason}</Callout> : null}
      {result?.kind === "error" ? <Callout tone="error">{result.error}</Callout> : null}

      {recent.length > 0 ? (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="eyebrow">Recent changes</p>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                <span className={r.undone ? "text-taupe-strong line-through" : ""}>{r.summary}</span>
                {r.undone ? <span className="text-xs text-taupe-strong">Undone</span> : (
                  <ActionButton variant="ghost" size="sm" action={() => undoPrefChangeAction(r.id)}>
                    <Undo2 aria-hidden /> Undo
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
