import { describe, expect, it } from "vitest";
import { buildAuthUrl, exchangeCode, revokeToken, signOAuthState, verifyOAuthState } from "@/lib/adapters/calendar/oauth";
import { AuthorizationError } from "@/lib/adapters/calendar/types";
import { syncDefaults } from "@/config/policy";

const secret = "test-secret";

describe("oauth state", () => {
  it("accepts a valid state and returns the nonce", () => {
    const { token, nonce } = signOAuthState({ userId: "u1", secret });
    expect(verifyOAuthState(token, secret, "u1")).toEqual({ ok: true, nonce });
  });
  it("rejects expired, tampered, wrong-user, wrong-secret and malformed states", () => {
    const { token } = signOAuthState({ userId: "u1", secret, ttlSeconds: 60, nowMs: 0 });
    expect(verifyOAuthState(token, secret, "u1", 120_000)).toMatchObject({ ok: false, reason: "expired" });
    const live = signOAuthState({ userId: "u1", secret }).token;
    expect(verifyOAuthState(live, secret, "u2")).toMatchObject({ ok: false, reason: "wrong_user" });
    expect(verifyOAuthState(live, "other", "u1")).toMatchObject({ ok: false, reason: "bad_signature" });
    const [body, sig] = live.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "u2", n: "x", exp: 9e9 })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`, secret, "u2")).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyOAuthState(`${body}`, secret, "u1")).toMatchObject({ ok: false, reason: "malformed" });
    expect(verifyOAuthState("a.b.c", secret, "u1")).toMatchObject({ ok: false, reason: "malformed" });
  });
  it("auth url requests offline read-only access with minimal scopes", () => {
    const u = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "https://app.example/cb", state: "st" }));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("include_granted_scopes")).toBe("false");
    expect(u.searchParams.get("scope")).toBe(syncDefaults.scopes.join(" "));
    expect(u.searchParams.get("scope")).not.toMatch(/auth\/calendar(\s|$)/);
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example/cb");
  });
  it("maps invalid_grant to AuthorizationError and revoke is best effort", async () => {
    const bad = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode({ code: "c", clientId: "a", clientSecret: "b", redirectUri: "r" }, bad)).rejects.toBeInstanceOf(AuthorizationError);
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await revokeToken("t", boom)).toBe(false);
  });
});
