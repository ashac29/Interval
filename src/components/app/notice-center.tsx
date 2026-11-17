"use client";
import * as React from "react";
import { Bell } from "lucide-react";
import { markNoticesRead, runDueRemindersNow } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionButton } from "./action";

export interface NoticeLite {
  id: string;
  title: string;
  body: string;
  when: string;
  read: boolean;
}
export interface MailLite {
  id: string;
  subject: string;
  to: string | null;
  when: string;
  status: "previewed" | "sent";
}

export function NoticeCenter({ notices, mails, mode, pendingJobs }: { notices: NoticeLite[]; mails: MailLite[]; mode: "demo" | "live"; pendingJobs: number }) {
  const unread = notices.filter((n) => !n.read).length;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Reminders, ${unread} unread` : "Reminders"} className="relative">
          <Bell aria-hidden />
          {unread > 0 ? <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-burnt text-[10px] font-semibold text-cream">{unread}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent title="Reminders" description={mode === "demo" ? "Demo: reminders are simulated here. Real reminders are sent by a scheduled background job, not by your browser." : "In-app reminders are created by a scheduled background job; they appear here the next time you open the app."}>
        <div className="space-y-3">
          {notices.length === 0 ? <p className="text-sm text-taupe-strong">No reminders yet. When you add a suggestion to your plan, a reminder is scheduled ({pendingJobs} pending).</p> : null}
          <ul className="space-y-2">
            {notices.slice(0, 12).map((n) => (
              <li key={n.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{n.title}</p>
                  {!n.read ? <Badge tone="demo">New</Badge> : null}
                </div>
                <p className="text-taupe-strong">{n.body}</p>
                <p className="mt-1 text-xs text-taupe-strong">{n.when}</p>
              </li>
            ))}
          </ul>
          {mails.length > 0 ? (
            <div className="space-y-2">
              <p className="eyebrow">Email</p>
              <ul className="space-y-2">
                {mails.slice(0, 6).map((m) => (
                  <li key={m.id} className="rounded-[var(--radius-md)] border border-dashed border-line p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{m.subject}</p>
                      <Badge tone={m.status === "sent" ? "live" : "warn"}>{m.status === "sent" ? "Sent" : "Preview — not sent"}</Badge>
                    </div>
                    <p className="text-xs text-taupe-strong">To {m.to ?? "(no address)"} · {m.when}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "demo" ? (
            <ActionButton variant="outline" size="sm" action={runDueRemindersNow}>
              Run due reminders now
            </ActionButton>
          ) : null}
          {unread > 0 ? (
            <ActionButton variant="subtle" size="sm" action={markNoticesRead}>
              Mark all read
            </ActionButton>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
