import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, verifyOAuthState } from "@/lib/adapters/calendar";
import { refreshLiveCalendar } from "@/lib/calendar-refresh";
import { encryptSecret } from "@/lib/crypto";
import { getEnv, googleConfigured, googleRedirectUri } from "@/lib/env";
import { getCtx } from "@/lib/session";
import { saveCredentials } from "@/lib/supabase/credentials";
import { syncDefaults } from "@/config/policy";
import { NONCE_COOKIE } from "@/lib/oauth-cookie";

/** Exact redirect URI to register in Google Cloud: <APP_URL>/api/calendar/google/callback */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (code: string) => {
    const res = NextResponse.redirect(new URL(`/account?calendar=${code}`, origin));
    res.cookies.delete({ name: NONCE_COOKIE, path: "/api/calendar/google" });
    return res;
  };
  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back("denied");
  const ctx = await getCtx();
  if (!ctx || ctx.mode !== "live" || !ctx.user) return back("signin_required");
  if (!googleConfigured()) return back("not_configured");
  const env = getEnv();

  const state = sp.get("state");
  const code = sp.get("code");
  const nonceCookie = request.cookies.get(NONCE_COOKIE)?.value;
  if (!state || !code || !nonceCookie) return back("invalid_state");
  const check = verifyOAuthState(state, env.oauthStateSecret as string, ctx.user.id);
  if (!check.ok || check.nonce !== nonceCookie) return back("invalid_state");

  const redirectUri = googleRedirectUri(origin);
  if (!redirectUri) return back("not_configured");
  try {
    const tokens = await exchangeCode({ code, clientId: env.googleClientId as string, clientSecret: env.googleClientSecret as string, redirectUri });
    if (!tokens.refreshToken) return back("no_refresh_token");
    await saveCredentials(ctx.user.id, encryptSecret(tokens.refreshToken, env.tokenEncryptionKey as string));
    const userId = ctx.user.id;
    await ctx.store.mutate(userId, async (s) => {
      s.calendar = { ...s.calendar, status: "connected", provider: "google", isDemo: false, scopes: [...syncDefaults.scopes], lastError: null, syncIntervalMinutes: env.sync.intervalMinutes };
      await refreshLiveCalendar(s, userId, new Date(), { forceFull: true });
      return { ok: true as const, message: "connected" };
    });
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { SupabaseStateStore } = await import("@/lib/store/supabase");
      const { mirrorConnection } = await import("@/lib/jobs");
      await mirrorConnection(createAdminClient(), userId, SupabaseStateStore.fromClient(createAdminClient()));
    } catch {
      // Scheduling mirror is best-effort; the manual refresh path still works.
    }
    return back("connected");
  } catch {
    return back("failed");
  }
}
