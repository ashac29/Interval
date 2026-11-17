"use client";
import * as React from "react";
import { savePrefs } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { PrefsFields, toPayload, type Group, type PrefsValues } from "./prefs-editor";
import { useRun } from "./action";
import { useDeviceTimezone } from "@/lib/use-device-tz";

const SECTIONS: { id: Group; title: string }[] = [
  { id: "flavor", title: "Flavors" },
  { id: "timing", title: "Timing" },
  { id: "reminders", title: "Notifications & quiet hours" },
  { id: "caffeine", title: "Caffeine & dietary" },
  { id: "timezone", title: "Planning timezone" },
];

export function AccountPrefs({ initial, demo }: { initial: PrefsValues; demo: boolean }) {
  const [v, setV] = React.useState(initial);
  const deviceTz = useDeviceTimezone();
  const { pending, run } = useRun();
  const set = (p: Partial<PrefsValues>) => setV((x) => ({ ...x, ...p }));
  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePrefs(toPayload(v)));
      }}
    >
      {SECTIONS.map((s) => (
        <fieldset key={s.id} className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          <legend className="px-1 font-display text-xl">{s.title}</legend>
          <PrefsFields group={s.id} v={v} set={set} deviceTz={deviceTz} demo={demo} />
        </fieldset>
      ))}
      <Button size="lg" type="submit" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>
    </form>
  );
}
