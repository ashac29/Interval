"use client";
import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { DIETARY_OPTIONS, FLAVORS, type Flavor } from "@/config/products";
import { TIMEZONE_CHOICES } from "@/lib/domain/time";
import { cn } from "@/lib/utils";

export interface PrefsValues {
  flavorRank: Flavor[];
  timing: "before" | "after" | "either";
  busyDaySuggestions: boolean;
  remindersInApp: boolean;
  remindersEmail: boolean;
  emailAddress: string;
  leadMinutes: number;
  quietStart: string;
  quietEnd: string;
  caffeineCeilingMg: number;
  caffeineCutoff: string;
  dietary: string[];
  timezone: string;
  maxDrinksPerDay: number;
}

const NAMES: Record<Flavor, string> = { chai: "Chai", oolong: "Oolong", matcha: "Matcha" };
export type Group = "flavor" | "timing" | "reminders" | "caffeine" | "timezone";

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint ? <p className="text-xs text-taupe-strong">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function PrefsFields({ group, v, set, deviceTz, demo }: { group: Group; v: PrefsValues; set: (p: Partial<PrefsValues>) => void; deviceTz?: string | null; demo?: boolean }) {
  if (group === "flavor")
    return (
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Flavors you like (first pick is your top flavor)</legend>
          <div className="flex flex-wrap gap-2">
            {FLAVORS.map((f) => {
              const idx = v.flavorRank.indexOf(f);
              return (
                <button key={f} type="button" aria-pressed={idx >= 0} onClick={() => set({ flavorRank: idx >= 0 ? v.flavorRank.filter((x) => x !== f) : [...v.flavorRank, f] })} className={cn("rounded-full border px-4 py-2 text-sm font-medium", idx >= 0 ? "border-espresso bg-espresso text-cream" : "border-field bg-surface")}>
                  {idx >= 0 ? `${idx + 1}. ` : ""}{NAMES[f]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-taupe-strong">Skip it for no preference. These are your explicit choices and always outrank anything inferred from behavior.</p>
        </fieldset>
        <Callout tone="warning" title="Contains milk">interval is made with milk protein (a milk allergen). It isn&rsquo;t suitable for milk allergy, dairy-free or vegan diets.</Callout>
      </div>
    );
  if (group === "timing")
    return (
      <div className="space-y-5">
        <Field label="When do you prefer a drink around a workout?" htmlFor="timing">
          <Select id="timing" value={v.timing} onChange={(e) => set({ timing: e.target.value as PrefsValues["timing"] })}>
            <option value="either">Before or after, whichever fits</option>
            <option value="after">After workouts</option>
            <option value="before">Before workouts</option>
          </Select>
        </Field>
        <Toggle id="busy" label="Suggest on busy days without a workout" hint="Optional. Uses your longest open gap on days with lots of events." checked={v.busyDaySuggestions} onChange={(b) => set({ busyDaySuggestions: b })} />
        <Field label="Most drinks per day to suggest" htmlFor="max" hint="Interval never suggests more than 2 a day. This is a cap, not a target.">
          <Select id="max" value={v.maxDrinksPerDay} onChange={(e) => set({ maxDrinksPerDay: Number(e.target.value) })}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </Select>
        </Field>
      </div>
    );
  if (group === "reminders")
    return (
      <div className="space-y-5">
        <Toggle id="inapp" label="In-app reminders" hint="Shown in the bell menu. Sent by a scheduled job, not your browser." checked={v.remindersInApp} onChange={(b) => set({ remindersInApp: b })} />
        <Toggle id="email" label="Email reminders (opt-in)" hint={demo ? "Demo: emails are previewed in-app, never sent." : "Off unless you turn it on."} checked={v.remindersEmail} onChange={(b) => set({ remindersEmail: b })} />
        {v.remindersEmail ? (
          <Field label="Email address" htmlFor="addr"><Input id="addr" type="email" autoComplete="email" value={v.emailAddress} onChange={(e) => set({ emailAddress: e.target.value })} /></Field>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quiet hours start" htmlFor="qs"><Input id="qs" type="time" value={v.quietStart} onChange={(e) => set({ quietStart: e.target.value })} /></Field>
          <Field label="Quiet hours end" htmlFor="qe"><Input id="qe" type="time" value={v.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} /></Field>
        </div>
        <Field label="Remind me this many minutes before" htmlFor="lead">
          <Select id="lead" value={v.leadMinutes} onChange={(e) => set({ leadMinutes: Number(e.target.value) })}>
            {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </Select>
        </Field>
      </div>
    );
  if (group === "caffeine")
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily caffeine ceiling (mg)" htmlFor="ceil" hint="Default 400 mg is general adult guidance, not a target. You can lower it, not raise it.">
            <Input id="ceil" inputMode="numeric" value={v.caffeineCeilingMg} onChange={(e) => set({ caffeineCeilingMg: Number(e.target.value.replace(/[^\d]/g, "")) })} />
          </Field>
          <Field label="No drinks suggested after" htmlFor="cut" hint="Your caffeine cutoff time."><Input id="cut" type="time" value={v.caffeineCutoff} onChange={(e) => set({ caffeineCutoff: e.target.value })} /></Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Dietary restrictions</legend>
          {DIETARY_OPTIONS.map((o) => (
            <label key={o.id} className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-burnt)]" checked={v.dietary.includes(o.id)} onChange={(e) => set({ dietary: e.target.checked ? [...v.dietary, o.id] : v.dietary.filter((x) => x !== o.id) })} />
              {o.label}
            </label>
          ))}
          {v.dietary.length > 0 ? (
            <p className="flex gap-2 text-xs text-taupe-strong"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />We can&rsquo;t verify ingredient compatibility, so with any restriction selected interval won&rsquo;t suggest drinks. Check the can label.</p>
          ) : null}
        </fieldset>
      </div>
    );
  return (
    <div className="space-y-3">
      <Field label="Planning timezone" htmlFor="tz" hint="Daily limits and reminders use this zone, not your device's.">
        <Select id="tz" value={v.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {[...new Set([v.timezone, ...(deviceTz ? [deviceTz] : []), ...TIMEZONE_CHOICES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      {deviceTz && deviceTz !== v.timezone ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Your device is in {deviceTz.replace(/_/g, " ")}.
          <Button type="button" size="sm" variant="outline" onClick={() => set({ timezone: deviceTz })}>Use device timezone</Button>
        </p>
      ) : null}
    </div>
  );
}

export function toPayload(v: PrefsValues) {
  return {
    flavorRank: v.flavorRank,
    timing: v.timing,
    busyDaySuggestions: v.busyDaySuggestions,
    maxDrinksPerDay: v.maxDrinksPerDay,
    remindersInApp: v.remindersInApp,
    remindersEmail: v.remindersEmail,
    emailAddress: v.remindersEmail ? v.emailAddress : null,
    leadMinutes: v.leadMinutes,
    quietStart: v.quietStart,
    quietEnd: v.quietEnd,
    caffeineCeilingMg: v.caffeineCeilingMg,
    caffeineCutoff: v.caffeineCutoff,
    dietary: v.dietary,
    timezone: v.timezone,
  };
}
