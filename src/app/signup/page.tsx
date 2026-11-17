import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/app/auth-form";
import { Wordmark } from "@/components/brand/wordmark";
import { supabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <div className="mx-auto max-w-md space-y-8 px-5 py-10">
      <Link href="/" aria-label="interval, home"><Wordmark size="md" /></Link>
      <h1 className="text-5xl">Create your account.</h1>
      <AuthForm mode="signup" configured={supabaseConfigured()} />
    </div>
  );
}
