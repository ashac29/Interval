"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeOnboarding, connectDemoCalendar } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { useDeviceTimezone } from "@/lib/use-device-tz";
import { PrefsFields, toPayload, type Group, type PrefsValues } from "./prefs-editor";

const STEPS: { id: Group | "name" | "calendar"; title: string; blurb: string }[] = [
  { id: "flavor", title: "What do you like?", blurb: "Pick flavors, or skip. You can change everything later." },
  { id: "timing", title: "How should drinks fit your day?", blurb: "Around workouts, and optionally on busy days." },
  { id: "reminders", title: "Reminders & quiet hours", blurb: "In-app by default. Email is opt-in." },
  { id: "caffeine", title: "Caffeine & dietary", blurb: "Your limits come first. Milk is an allergen in every flavor." },
  { id: "timezone", title: "Your planning timezone", blurb: "Daily limits use this zone." },
  { id: "calendar", title: "Calendar (optional)", blurb: "Connecting a calendar is a separate step from your account, and read-only." },
];

export function OnboardingWizard({ initial, demo, displayName, googleReady, signedInLive }: { initial: PrefsValues; demo: boolean; displayName: string; googleReady: boolean; signedInLive: boolean }) {
  const router = useRouter();
  const [i, setI] = React.useState(0);
  const [v, setV] = React.useState<PrefsValues>(initial);
  const [name, setName] = React.useState(displayName);
  const deviceTz = useDeviceTimezone();
  const [tzTouched, setTzTouched] = React.useState(false);
  const [pending, start] = React.useTransition();
  // Live accounts default to the device timezone as a starting point; the user can change it in the step.
  const effTz = tzTouched || demo || !deviceTz ? v.timezone : deviceTz;
  const view: PrefsValues = { ...v, timezone: effTz };
  const set = (p: Partial<PrefsValues>) => {
    if (p.timezone) setTzTouched(true);
    setV((x) => ({ ...x, ...p }));
  };
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  function finish(thenConnect: "google" | "demo" | "skip") {
    start(async () => {
      const r = await completeOnboarding(toPayload(view), name);
      if (!r.ok) return void toast.error(r.error);
      if (thenConnect === "demo") await connectDemoCalendar();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- OAuth start is an API route, not a Next page
      if (thenConnect === "google") window.location.href = "/api/calendar/google/connect";
      else router.push("/today");
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-3">
        <p className="eyebrow">Step {i + 1} of {STEPS.length}</p>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, k) => <span key={s.id} className={`h-1 flex-1 rounded-full ${k <= i ? "bg-espresso" : "bg-line"}`} />)}
        </div>
        <h1 className="text-4xl sm:text-5xl">{step.title}</h1>
        <p className="text-taupe-strong">{step.blurb}</p>
      </div>

      <div className="space-y-5">
        {i === 0 ? <Field label="What should we call you? (optional)" htmlFor="nm"><Input id="nm" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></Field> : null}
        {step.id !== "calendar" && step.id !== "name" ? <PrefsFields group={step.id} v={view} set={set} deviceTz={deviceTz} demo={demo} /> : null}
        {step.id === "calendar" ? (
          <div className="space-y-4">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-taupe-strong">
              <li>Read-only: we can never create, change or delete events.</li>
              <li>We import only titles, times, timezone, availability and status, never descriptions or attendees.</li>
              <li>Window: previous 7 and next 14 days. Disconnect or delete imported data anytime.</li>
            </ul>
            {demo ? <Callout tone="demo" title="Demo">Connecting loads sample events. No real calendar is touched.</Callout> : null}
            {!demo && !googleReady ? <Callout tone="info" title="Google Calendar isn&rsquo;t configured on this server">You can skip this and still log drinks and manage supply. See the README for setup.</Callout> : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              {demo ? <Button size="lg" disabled={pending} onClick={() => finish("demo")}>Load demo calendar</Button> : <Button size="lg" disabled={pending || !googleReady || !signedInLive} onClick={() => finish("google")}>Connect Google Calendar (read-only)</Button>}
              <Button size="lg" variant="outline" disabled={pending} onClick={() => finish("skip")}>Skip for now</Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={i === 0 || pending} onClick={() => setI(i - 1)}>Back</Button>
        {!last ? <Button onClick={() => setI(i + 1)}>Continue</Button> : <Link href="/today" className="sr-only">Skip</Link>}
      </div>
    </div>
  );
}
