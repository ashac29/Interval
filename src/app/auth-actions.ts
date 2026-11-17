"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getEnv, supabaseConfigured } from "@/lib/env";

export type AuthResult = { ok: true; message: string } | { ok: false; error: string };
const creds = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(8).max(200) });

async function origin(): Promise<string> {
  const env = getEnv();
  if (env.appUrl) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const notConfigured: AuthResult = { ok: false, error: "Sign-in isn’t configured on this server. Try the demo instead." };

export async function signInAction(email: string, password: string): Promise<AuthResult> {
  if (!supabaseConfigured()) return notConfigured;
  const p = creds.safeParse({ email, password });
  if (!p.success) return { ok: false, error: "Enter a valid email and a password of at least 8 characters." };
  const { createClient } = await import("@/lib/supabase/server");
  const { error } = await (await createClient()).auth.signInWithPassword(p.data);
  if (error) return { ok: false, error: "That email and password didn’t match." };
  redirect("/today");
}

export async function signUpAction(email: string, password: string): Promise<AuthResult> {
  if (!supabaseConfigured()) return notConfigured;
  const p = creds.safeParse({ email, password });
  if (!p.success) return { ok: false, error: "Enter a valid email and a password of at least 8 characters." };
  const { createClient } = await import("@/lib/supabase/server");
  const { data, error } = await (await createClient()).auth.signUp({ ...p.data, options: { emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding` } });
  if (error) return { ok: false, error: "Couldn’t create that account. Try a different email or password." };
  if (data.session) redirect("/onboarding");
  return { ok: true, message: "Check your email to confirm your account, then sign in." };
}

export async function magicLinkAction(email: string): Promise<AuthResult> {
  if (!supabaseConfigured()) return notConfigured;
  const p = z.string().trim().toLowerCase().email().max(200).safeParse(email);
  if (!p.success) return { ok: false, error: "Enter a valid email." };
  const { createClient } = await import("@/lib/supabase/server");
  const { error } = await (await createClient()).auth.signInWithOtp({ email: p.data, options: { emailRedirectTo: `${await origin()}/auth/callback?next=/today` } });
  if (error) return { ok: false, error: "Couldn’t send a link right now." };
  return { ok: true, message: "If that address can sign in, a link is on its way." };
}
