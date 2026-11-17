"use client";
import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { magicLinkAction, signInAction, signUpAction, type AuthResult } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";

export function AuthForm({ mode, configured }: { mode: "login" | "signup"; configured: boolean }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [res, setRes] = React.useState<AuthResult | null>(null);
  const [pending, start] = React.useTransition();
  const go = (fn: () => Promise<AuthResult>) =>
    start(async () => {
      try {
        setRes(await fn());
      } catch {
        /* redirect() on success navigates; nothing to show */
      }
    });
  return (
    <div className="space-y-5">
      {!configured ? (
        <Callout tone="info" title="Accounts aren’t set up on this server">
          Sign-in needs a Supabase project (see the README). You can explore everything with the demo in the meantime.
          <div className="mt-3"><Button asChild size="sm"><a href="/demo">Explore demo</a></Button></div>
        </Callout>
      ) : null}
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(() => (mode === "login" ? signInAction(email, password) : signUpAction(email, password))); }}>
        <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={!configured} /></Field>
        <Field label="Password" htmlFor="pw" hint={mode === "signup" ? "At least 8 characters." : undefined}><Input id="pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!configured} /></Field>
        <Button type="submit" size="lg" className="w-full" disabled={!configured || pending}>{pending ? <Loader2 className="animate-spin" aria-hidden /> : null}{mode === "login" ? "Sign in" : "Create account"}</Button>
      </form>
      {mode === "login" ? <Button variant="outline" className="w-full" disabled={!configured || pending || !email} onClick={() => go(() => magicLinkAction(email))}>Email me a sign-in link</Button> : null}
      {res ? <Callout tone={res.ok ? "success" : "error"}>{res.ok ? res.message : res.error}</Callout> : null}
      <p className="text-sm text-taupe-strong">
        {mode === "login" ? <>New here? <Link className="underline" href="/signup">Create an account</Link>.</> : <>Already have an account? <Link className="underline" href="/login">Sign in</Link>.</>} Your account is separate from calendar access, which you can add or skip afterward.
      </p>
    </div>
  );
}
