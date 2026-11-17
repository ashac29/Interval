import { getAi } from "@/lib/ai";
import { getEmailAdapter } from "@/lib/mail";
import { processDueJobs } from "@/lib/domain/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseStateStore } from "@/lib/store/supabase";
import { refreshLiveCalendar } from "@/lib/calendar-refresh";
import { getEnv, serviceRoleConfigured } from "@/lib/env";
import { isoOf } from "@/lib/domain/time";
import { recompute } from "@/lib/domain/engine";
import type { AppState } from "@/lib/domain/types";

/**
 * Durable job runner. Job state lives in each user's snapshot (reminders[]) and is
 * indexed by `user_state.next_job_at`; calendar syncs are indexed by
 * `calendar_connections.next_sync_at`. ANY scheduler may call `runDueJobs`
 * (default: Vercel Cron -> GET /api/jobs/run). Re-running is safe: processing is
 * idempotent (dedupe keys, status checks) and failures retry with backoff.
 */
export interface JobsSummary {
  reminderUsers: number;
  remindersSent: number;
  remindersPreviewed: number;
  retried: number;
  failed: number;
  syncsRun: number;
  syncsFailed: number;
}

export async function runDueJobs(now: Date = new Date()): Promise<JobsSummary> {
  const out: JobsSummary = { reminderUsers: 0, remindersSent: 0, remindersPreviewed: 0, retried: 0, failed: 0, syncsRun: 0, syncsFailed: 0 };
  if (!serviceRoleConfigured()) return out;
  const admin = createAdminClient();
  const store = SupabaseStateStore.fromClient(admin);
  void getAi;

  // 1. Scheduled calendar syncs.
  const { data: due } = await admin.from("calendar_connections").select("user_id").lte("next_sync_at", isoOf(now.getTime())).eq("provider", "google").limit(100);
  for (const row of due ?? []) {
    const userId = row.user_id as string;
    try {
      const res = await store.mutate(userId, async (state: AppState) => {
        const r = await refreshLiveCalendar(state, userId, now);
        return r.ok ? ({ ok: true as const, message: r.summary }) : ({ ok: true as const, message: r.error, failed: true });
      });
      if ((res as { failed?: boolean }).failed) out.syncsFailed++;
      else out.syncsRun++;
      await mirrorConnection(admin, userId, store);
    } catch {
      out.syncsFailed++;
    }
  }

  // 2. Due reminders.
  const email = getEmailAdapter("live");
  const ids = await store.listDueUserIds(now);
  for (const id of ids) {
    try {
      const s = await store.mutate(id, async (state: AppState) => {
        const summary = await processDueJobs(state, now, email);
        if (summary.processed > 0) recompute(state, now, { trigger: "job_tick" });
        return { ok: true as const, message: "processed", summary };
      });
      out.reminderUsers++;
      out.remindersSent += s.summary.sent;
      out.remindersPreviewed += s.summary.previewed;
      out.retried += s.summary.retried;
      out.failed += s.summary.failed;
    } catch {
      out.failed++;
    }
  }
  void getEnv;
  return out;
}

/** Keep the non-secret connection row (used to schedule syncs) in step with state. */
export async function mirrorConnection(admin: ReturnType<typeof createAdminClient>, userId: string, store: SupabaseStateStore) {
  const state = await store.get(userId);
  if (!state) return;
  const c = state.calendar;
  await admin.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: c.provider ?? "google",
      status: c.status,
      calendars: c.calendars.map((x) => ({ id: x.id, name: x.name, selected: x.selected })),
      last_sync_at: c.lastSyncAt,
      next_sync_at: c.status === "connected" ? c.nextSyncAt : null,
      sync_interval_minutes: c.syncIntervalMinutes,
      last_error: c.lastError,
      scopes: c.scopes,
    },
    { onConflict: "user_id" },
  );
}
