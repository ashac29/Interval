import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { policy } from "@/config/policy";

export const metadata: Metadata = { title: "Privacy & data retention" };

export default function Privacy() {
  const r = policy.retention;
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-5 py-10">
      <Link href="/" aria-label="interval, home"><Wordmark size="md" /></Link>
      <h1 className="text-5xl">Privacy & data retention</h1>
      <p className="text-taupe-strong">interval is a hypothetical product built for an academic project. This page describes what the app does with data, so a real deployment can be reviewed honestly.</p>
      {[
        ["What we import from your calendar", `Only event title, start/end, timezone, availability and status, plus provider identifiers (and recurrence identifiers when needed). We never import descriptions or attendee lists. Access is read-only and limited to the calendar list and events scopes. Only calendars you select are used.`],
        ["How long we keep it", `Imported events are kept only inside a rolling window: the previous ${r.calendarPastDays} days and next ${r.calendarFutureDays} days. Anything outside the window is deleted on every sync. Cached classifications and remembered title mappings are removed when you delete imported data or disconnect.`],
        ["What reaches an AI model", "Only a single event title (sanitized and length-limited) when a title is ambiguous, your typed preference request, or a summary of your already-validated weekly plan. Never descriptions, attendees, other calendars, or your full event list. Titles are treated as untrusted data, never instructions. In demo mode no model is called."],
        ["Credentials", "Calendar refresh tokens are encrypted at rest and stored server-side, never in the browser, and unreadable by client database roles. Disconnecting deletes them and asks Google to revoke access where supported."],
        ["Your learning data", "We record events like accepted, rescheduled or dismissed suggestions and confirmed preference changes to improve timing for you. History is append-only; undo adds a compensating event. It is used for lightweight per-user adaptation, not model training."],
        ["Logs", "Routine logs avoid event titles, descriptions and prompts."],
        ["Deleting your data", "Account → Delete imported data removes events, classifications and remembered titles. Account → Delete account removes your profile, preferences, logs, credentials and sign-in, and cascades to every user-owned record."],
        ["Demo sessions", "Demo visitors get an isolated, private session. Demo data is invented, labeled as such, and expires automatically."],
      ].map(([h, p]) => (
        <section key={h} className="space-y-2">
          <h2 className="text-2xl">{h}</h2>
          <p className="text-taupe-strong">{p}</p>
        </section>
      ))}
    </div>
  );
}
