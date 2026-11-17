import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/env";

/** Supabase email-confirmation / magic-link landing. Only same-origin relative redirects are honored. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/today";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/today";
  if (!supabaseConfigured() || !code) return NextResponse.redirect(new URL("/login?error=callback", origin));
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=callback", origin));
  return NextResponse.redirect(new URL(next, origin));
}
