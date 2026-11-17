import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getEnv, serviceRoleConfigured } from "@/lib/env";
import { runDueJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = getEnv().cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Durable job tick: due reminders (retry/dedupe/revalidate) and scheduled calendar syncs.
 * Called by Vercel Cron (sends `Authorization: Bearer $CRON_SECRET`) or any scheduler.
 */
async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!serviceRoleConfigured()) return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
  const summary = await runDueJobs();
  return NextResponse.json({ ok: true, ...summary });
}
export const GET = handle;
export const POST = handle;
