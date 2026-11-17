import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/app/auth-form";
import { Wordmark } from "@/components/brand/wordmark";
import { supabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <div className="mx-auto max-w-md space-y-8 px-5 py-10">
      <Link href="/" aria-label="interval, home"><Wordmark size="md" /></Link>
      <h1 className="text-5xl">Welcome back.</h1>
      <AuthForm mode="login" configured={supabaseConfigured()} />
    </div>
  );
}
