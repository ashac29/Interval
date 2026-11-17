"use client";
import * as React from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { connectDemoCalendar, deleteAccount, deleteImportedData, disconnectCalendar, exportMyData, forgetMapping, refreshCalendar, signOut, toggleCalendar } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ActionButton, ConfirmAction, useRun } from "./action";

export function CalendarPicker({ calendars }: { calendars: { id: string; name: string; selected: boolean }[] }) {
  const { run } = useRun();
  return (
    <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
      {calendars.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <label htmlFor={`cal-${c.id}`} className="text-sm font-medium">{c.name}</label>
          <Switch id={`cal-${c.id}`} checked={c.selected} onCheckedChange={(b) => run(() => toggleCalendar(c.id, b))} />
        </li>
      ))}
    </ul>
  );
}

export function CalendarActions({ connected, demo, googleReady, needsReconnect }: { connected: boolean; demo: boolean; googleReady: boolean; needsReconnect: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {connected ? (
        <ActionButton size="sm" variant="outline" action={refreshCalendar} pendingLabel="Refreshing…"><RefreshCw aria-hidden /> Refresh now</ActionButton>
      ) : demo ? (
        <ActionButton size="sm" action={connectDemoCalendar}>Load demo calendar</ActionButton>
      ) : (
        <Button size="sm" asChild={googleReady} disabled={!googleReady}>{googleReady ? <a href="/api/calendar/google/connect">Connect Google Calendar (read-only)</a> : <span>Connect Google Calendar</span>}</Button>
      )}
      {!demo && googleReady && (needsReconnect || connected) ? <Button size="sm" variant="outline" asChild><a href="/api/calendar/google/connect">Reconnect</a></Button> : null}
      {connected ? (
        <ConfirmAction trigger={<Button size="sm" variant="outline">Disconnect</Button>} title="Disconnect calendar?" description={demo ? "Removes the demo events from your session." : "Deletes stored credentials, asks Google to revoke access where supported, and removes imported events."} confirmLabel="Disconnect" tone="danger" action={disconnectCalendar} />
      ) : null}
      <ConfirmAction trigger={<Button size="sm" variant="ghost">Delete imported data</Button>} title="Delete imported calendar data?" description="Removes imported events, cached classifications and remembered workout titles. Your connection stays; the next refresh re-imports the window." confirmLabel="Delete imported data" tone="danger" action={deleteImportedData} />
    </div>
  );
}

export function ForgetMapping({ title }: { title: string }) {
  return <ActionButton size="sm" variant="ghost" action={() => forgetMapping(title)}>Forget</ActionButton>;
}

export function PrivacyActions({ demo }: { demo: boolean }) {
  const [text, setText] = React.useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const r = await exportMyData();
            if (!r.ok) return void toast.error(r.error);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
            a.download = "interval-data.json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download aria-hidden /> Export my data
        </Button>
        <form action={signOut}><Button size="sm" variant="outline" type="submit">{demo ? "End demo session" : "Sign out"}</Button></form>
      </div>
      <ConfirmAction
        trigger={<Button size="sm" variant="danger">{demo ? "Delete demo data" : "Delete account"}</Button>}
        title={demo ? "Delete this demo session?" : "Delete your account?"}
        description={demo ? "Removes everything in your private demo session." : "Permanently removes your profile, preferences, logs, imported calendar data, stored credentials and sign-in. This can't be undone."}
        confirmLabel="Delete everything"
        tone="danger"
        action={async () => (await deleteAccount(text)) as never}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">Type DELETE to confirm
          <Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </label>
      </ConfirmAction>
    </div>
  );
}
