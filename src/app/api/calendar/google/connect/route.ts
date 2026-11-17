import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, signOAuthState } from "@/lib/adapters/calendar";
import { getEnv, googleConfigured, googleRedirectUri } from "@/lib/env";
import { getCtx } from "@/lib/session";
import { NONCE_COOKIE } from "@/lib/oauth-cookie";

/**
 * Starts the read-only Google Calendar consent flow. Requires a signed-in (live) user,
 * which keeps account authentication and calendar permission as separate steps.
 * OAuth `state` is HMAC-signed, expires in 10 minutes, is bound to the user, and its
 * nonce is also pinned in an httpOnly cookie so the callback is single-use.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const ctx = await getCtx();
  if (!ctx || ctx.mode !== "live" || !ctx.user) return NextResponse.redirect(new URL("/account?calendar=signin_required", origin));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/account?calendar=not_configured", origin));
  const env = getEnv();
  const redirectUri = googleRedirectUri(origin);
  if (!redirectUri) return NextResponse.redirect(new URL("/account?calendar=not_configured", origin));
  const { token, nonce } = signOAuthState({ userId: ctx.user.id, secret: env.oauthStateSecret as string });
  const url = buildAuthUrl({ clientId: env.googleClientId as string, redirectUri, state: token, ...(ctx.user.email ? { loginHint: ctx.user.email } : {}) });
  const res = NextResponse.redirect(url);
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/calendar/google", maxAge: 600 });
  return res;
}
