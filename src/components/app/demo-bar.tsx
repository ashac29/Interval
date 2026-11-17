"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { advanceDemoClock } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { ActionButton } from "./action";

export function DemoBar({ scenarios, current, clock }: { scenarios: { id: string; name: string }[]; current: string | null; clock: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(current ?? scenarios[0]?.id ?? "");
  return (
    <div className="border-b border-burnt/30 bg-[#f6e3cf] text-espresso">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm md:px-10">
        <p className="flex items-center gap-2 font-medium">
          <FlaskConical className="size-4" aria-hidden /> Demo session
          <span className="hidden font-normal text-taupe-strong sm:inline">— simulated data. Nothing here is live, delivered or charged.</span>
        </p>
        <p className="tabular text-taupe-strong">Simulated time: {clock}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="scenario">
            Demo scenario
          </label>
          <Select id="scenario" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 min-h-9 max-w-[16rem] bg-cream py-0 text-sm">
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={() => router.push(`/demo?scenario=${encodeURIComponent(value)}`)}>
            Load scenario
          </Button>
          <ActionButton size="sm" variant="ghost" action={() => advanceDemoClock(60)}>
            +1 hour
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
