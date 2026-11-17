import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { BottomNav, SidebarNav } from "./nav";
import { DemoBar } from "./demo-bar";
import { NoticeCenter, type MailLite, type NoticeLite } from "./notice-center";
import { SCENARIOS } from "@/lib/domain/fixtures";
import type { AppState } from "@/lib/domain/types";

export function AppShell({ state, now, children }: { state: AppState; now: Date; children: React.ReactNode }) {
  const tz = state.prefs.timezone;
  const stamp = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  const notices: NoticeLite[] = state.notices.map((n) => ({ id: n.id, title: n.title, body: n.body, when: stamp(new Date(n.at)), read: n.read }));
  const mails: MailLite[] = state.emailPreviews.map((m) => ({ id: m.id, subject: m.subject, to: m.to, when: stamp(new Date(m.at)), status: m.status }));
  const pendingJobs = state.reminders.filter((j) => j.status === "pending").length;
  const demo = state.mode === "demo";
  const clock = stamp(now);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_1fr]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-line px-5 py-7 md:flex">
        <div className="space-y-9">
          <Link href="/today" aria-label="interval, home" className="block px-2">
            <Wordmark size="md" />
          </Link>
          <SidebarNav />
        </div>
        <div className="space-y-3 px-2 text-xs text-taupe-strong">
          <Badge tone={demo ? "demo" : "live"}>{demo ? "Demo · simulated" : "Live account"}</Badge>
          <p>{state.prefs.timezone.replace("_", " ")}</p>
          <p className="max-w-[12rem] leading-relaxed">Hypothetical product for an academic project.</p>
        </div>
      </aside>
      <div className="min-w-0">
        {demo ? <DemoBar scenarios={SCENARIOS.map((s) => ({ id: s.id, name: s.name }))} current={state.scenario} clock={clock} /> : null}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-cream/95 px-4 py-2 backdrop-blur md:static md:border-0 md:bg-transparent md:px-10 md:pt-5">
          <Link href="/today" className="md:hidden" aria-label="interval, home">
            <Wordmark size="sm" />
          </Link>
          <p className="hidden text-sm text-taupe-strong md:block">{state.profile.displayName ? `Hello, ${state.profile.displayName}` : ""}</p>
          <NoticeCenter notices={notices} mails={mails} mode={state.mode} pendingJobs={pendingJobs} />
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:px-10 md:pb-16 md:pt-4">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
