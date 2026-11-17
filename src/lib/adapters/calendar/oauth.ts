import { randomBytes } from "node:crypto";
import { syncDefaults } from "@/config/policy";
import { hmacSign, hmacVerify } from "@/lib/crypto";
import { AuthorizationError, TransientError } from "./types";

/**
 * Google OAuth helpers (authorization-code flow, offline access, read-only
 * calendar scopes). The signed `state` binds the flow to a user and expires;
 * the caller must additionally enforce single use of the returned nonce.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string; scopes?: readonly string[]; loginHint?: string }): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", (p.scopes ?? syncDefaults.scopes).join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "false");
  u.searchParams.set("state", p.state);
  if (p.loginHint) u.searchParams.set("login_hint", p.loginHint);
  return u.toString();
}

interface StatePayload {
  u: string;
  n: string;
  exp: number;
}

export function signOAuthState(p: { userId: string; secret: string; nonce?: string; ttlSeconds?: number; nowMs?: number }): { token: string; nonce: string } {
  const nonce = p.nonce ?? randomBytes(16).toString("base64url");
  const payload: StatePayload = { u: p.userId, n: nonce, exp: Math.floor(((p.nowMs ?? Date.now()) + (p.ttlSeconds ?? 600) * 1000) / 1000) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${hmacSign(body, p.secret)}`, nonce };
}

export type StateCheck = { ok: true; nonce: string } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_user" };

export function verifyOAuthState(token: string, secret: string, expectedUserId: string, nowMs = Date.now()): StateCheck {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  if (!hmacVerify(body, sig, secret)) return { ok: false, reason: "bad_signature" };
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.u !== "string" || typeof payload.n !== "string" || typeof payload.exp !== "number") return { ok: false, reason: "malformed" };
  if (payload.exp * 1000 < nowMs) return { ok: false, reason: "expired" };
  if (payload.u !== expectedUserId) return { ok: false, reason: "wrong_user" };
  return { ok: true, nonce: payload.n };
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenSet> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  } catch {
    throw new TransientError("Could not reach Google");
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok) {
    if (body.error === "invalid_grant" || res.status === 400 || res.status === 401) throw new AuthorizationError("Google rejected the authorization");
    throw new TransientError(`Google token endpoint error ${res.status}`);
  }
  if (!body.access_token) throw new AuthorizationError("Google returned no access token");
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresInSeconds: body.expires_in ?? 3600, scope: body.scope };
}

export function exchangeCode(p: { code: string; clientId: string; clientSecret: string; redirectUri: string }, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
  return tokenRequest({ code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri, grant_type: "authorization_code" }, fetchImpl);
}

export function refreshAccessToken(p: { refreshToken: string; clientId: string; clientSecret: string }, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
  return tokenRequest({ refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret, grant_type: "refresh_token" }, fetchImpl);
}

/** Best-effort revocation. Returns whether Google confirmed it. */
export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
    return res.ok;
  } catch {
    return false;
  }
}
