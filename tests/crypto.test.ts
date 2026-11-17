import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hmacSign, hmacVerify } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("roundtrips and uses a fresh IV each time", () => {
    const a = encryptSecret("refresh-token-123", key);
    const b = encryptSecret("refresh-token-123", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain("refresh-token");
    expect(decryptSecret(a, key)).toBe("refresh-token-123");
  });
  it("throws on tamper, wrong key, bad format and short keys", () => {
    const blob = encryptSecret("secret", key);
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(blob, randomBytes(32).toString("base64"))).toThrow();
    expect(() => decryptSecret("v2.a.b.c", key)).toThrow();
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow();
  });
  it("hmac verifies only the exact payload and secret", () => {
    const sig = hmacSign("payload", "s1");
    expect(hmacVerify("payload", sig, "s1")).toBe(true);
    expect(hmacVerify("payload2", sig, "s1")).toBe(false);
    expect(hmacVerify("payload", sig, "s2")).toBe(false);
    expect(hmacVerify("payload", "short", "s1")).toBe(false);
  });
});
