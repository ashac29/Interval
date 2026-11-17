import { policy as defaultPolicy, type PolicyConfig } from "@/config/policy";
import { getProduct } from "./catalog";
import { formatTime, inQuietHours, isoOf, nextQuietEnd } from "./time";
import type { AppState, ReminderJob } from "./types";
import type { EmailAdapter } from "@/lib/adapters/email";
import { newId } from "./ids";

/**
 * Durable reminder jobs. State is the source of truth; any scheduler (Vercel
 * Cron -> /api/jobs/run, or the demo "run due reminders" control) calls
 * `processDueJobs`. Jobs are deduplicated by (recommendation, drink time,
 * channel), cancelled when stale, revalidated before sending, retried on
 * transient failure, and never reported as delivered unless a provider sent them.
 */

export const dedupeKeyFor = (recId: string, drinkAtUtc: string, channel: ReminderJob["channel"]) => `${recId}|${drinkAtUtc}|${channel}`;

function updateNextJobAt(state: AppState) {
  const pending = state.reminders.filter((j) => j.status === "pending").map((j) => Date.parse(j.runAt));
  state.nextJobAt = pending.length ? isoOf(Math.min(...pending)) : null;
}

export function cancelRemindersFor(state: AppState, recId: string, reason: string, now: Date) {
  for (const j of state.reminders) {
    if (j.recommendationId === recId && j.status === "pending") {
      j.status = "cancelled";
      j.cancelReason = reason;
      j.processedAt = now.toISOString();
    }
  }
  updateNextJobAt(state);
}

/** Make the pending jobs match the accepted recommendations. Idempotent. */
export function syncReminders(state: AppState, now: Date, cfg: PolicyConfig = defaultPolicy) {
  const channels: ReminderJob["channel"][] = [];
  if (state.prefs.reminders.inApp) channels.push("in_app");
  if (state.prefs.reminders.email) channels.push("email");
  const wanted = new Map<string, { recId: string; drinkAtUtc: string; channel: ReminderJob["channel"] }>();
  for (const r of state.recommendations) {
    if (r.status !== "accepted") continue;
    if (Date.parse(r.startUtc) <= now.getTime()) continue;
    for (const ch of channels) wanted.set(dedupeKeyFor(r.id, r.startUtc, ch), { recId: r.id, drinkAtUtc: r.startUtc, channel: ch });
  }
  for (const j of state.reminders) {
    if (j.status === "pending" && !wanted.has(j.dedupeKey)) {
      const rec = state.recommendations.find((r) => r.id === j.recommendationId);
      j.status = "cancelled";
      j.cancelReason = !rec ? "recommendation_removed" : rec.status !== "accepted" ? `recommendation_${rec.status}` : rec.startUtc !== j.drinkAtUtc ? "rescheduled" : "channel_disabled";
      j.processedAt = now.toISOString();
    }
  }
  const lead = state.prefs.reminders.leadMinutes ?? cfg.reminders.defaultLeadMinutes;
  const existing = new Set(state.reminders.map((j) => j.dedupeKey));
  for (const [key, w] of wanted) {
    if (existing.has(key)) continue; // pending, or already sent/previewed/skipped: never duplicate
    state.reminders.push({
      id: newId("job"),
      recommendationId: w.recId,
      channel: w.channel,
      dedupeKey: key,
      runAt: isoOf(Math.max(now.getTime(), Date.parse(w.drinkAtUtc) - lead * 60_000)),
      drinkAtUtc: w.drinkAtUtc,
      status: "pending",
      attempts: 0,
    });
  }
  updateNextJobAt(state);
}

export interface ProcessSummary {
  processed: number;
  sent: number;
  previewed: number;
  cancelled: number;
  skipped: number;
  retried: number;
  failed: number;
  deferred: number;
}

export async function processDueJobs(state: AppState, now: Date, email: EmailAdapter, cfg: PolicyConfig = defaultPolicy): Promise<ProcessSummary> {
  const sum: ProcessSummary = { processed: 0, sent: 0, previewed: 0, cancelled: 0, skipped: 0, retried: 0, failed: 0, deferred: 0 };
  const tz = state.prefs.timezone;
  const due = state.reminders.filter((j) => j.status === "pending" && Date.parse(j.runAt) <= now.getTime());
  for (const job of due) {
    sum.processed++;
    const rec = state.recommendations.find((r) => r.id === job.recommendationId);
    const finish = (status: ReminderJob["status"], reason?: string) => {
      job.status = status;
      if (reason) job.cancelReason = reason;
      job.processedAt = now.toISOString();
    };

    // Revalidate recommendation status right before sending.
    if (!rec || rec.status !== "accepted" || rec.startUtc !== job.drinkAtUtc) {
      finish("cancelled", "stale");
      sum.cancelled++;
      continue;
    }
    if (Date.parse(job.drinkAtUtc) <= now.getTime()) {
      finish("skipped", "too_late");
      sum.skipped++;
      continue;
    }
    if (job.channel === "email" && (!state.prefs.reminders.email || !state.prefs.reminders.emailAddress)) {
      finish("cancelled", "email_opted_out");
      sum.cancelled++;
      continue;
    }
    if (job.channel === "in_app" && !state.prefs.reminders.inApp) {
      finish("cancelled", "in_app_disabled");
      sum.cancelled++;
      continue;
    }
    // Deduplicate against anything already delivered under the same key.
    if (state.reminders.some((o) => o.id !== job.id && o.dedupeKey === job.dedupeKey && (o.status === "sent" || o.status === "previewed"))) {
      finish("skipped", "duplicate");
      sum.skipped++;
      continue;
    }
    // Quiet hours (in the planning timezone).
    if (inQuietHours(now.getTime(), tz, state.prefs.quietHours)) {
      const resume = nextQuietEnd(now.getTime(), tz, state.prefs.quietHours);
      if (resume < Date.parse(job.drinkAtUtc)) {
        job.runAt = isoOf(resume);
        sum.deferred++;
      } else {
        finish("skipped", "quiet_hours");
        sum.skipped++;
      }
      continue;
    }

    const product = getProduct(state, rec.flavor);
    const when = formatTime(Date.parse(rec.startUtc), tz);
    const title = `${product.name} at ${when}`;
    const body = `Your planned drink is coming up. ${rec.reason} You can change or skip it in the app.`;

    if (job.channel === "in_app") {
      state.notices.unshift({ id: newId("note"), at: now.toISOString(), title, body, recommendationId: rec.id, read: false, jobId: job.id });
      finish("sent");
      sum.sent++;
      continue;
    }

    // Email channel.
    if (!email.configured) {
      state.emailPreviews.unshift({
        id: newId("mail"),
        at: now.toISOString(),
        to: state.prefs.reminders.emailAddress,
        subject: `Reminder: ${title}`,
        text: body,
        status: "previewed",
        jobId: job.id,
      });
      finish("previewed");
      sum.previewed++;
      continue;
    }
    let result: { ok: boolean; transient?: boolean; error?: string };
    if ((job.simulateFailures ?? 0) > 0) {
      job.simulateFailures = (job.simulateFailures ?? 0) - 1;
      result = { ok: false, transient: true, error: "simulated transient failure" };
    } else {
      try {
        result = await email.send({ to: state.prefs.reminders.emailAddress as string, subject: `Reminder: ${title}`, text: body, idempotencyKey: job.dedupeKey });
      } catch (e) {
        result = { ok: false, transient: true, error: e instanceof Error ? e.message : "send failed" };
      }
    }
    if (result.ok) {
      state.emailPreviews.unshift({ id: newId("mail"), at: now.toISOString(), to: state.prefs.reminders.emailAddress, subject: `Reminder: ${title}`, text: body, status: "sent", jobId: job.id });
      finish("sent");
      sum.sent++;
    } else {
      job.attempts++;
      job.lastError = (result.error ?? "error").slice(0, 120);
      if (result.transient && job.attempts < cfg.reminders.maxAttempts) {
        const back = cfg.reminders.backoffMinutes[Math.min(job.attempts - 1, cfg.reminders.backoffMinutes.length - 1)] ?? 5;
        job.runAt = isoOf(now.getTime() + back * 60_000);
        sum.retried++;
      } else {
        finish("failed");
        sum.failed++;
      }
    }
  }
  updateNextJobAt(state);
  return sum;
}
