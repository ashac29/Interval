import Link from "next/link";
import { AppShell } from "@/components/app/shell";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { getCtx, loadState } from "@/lib/session";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  if (ctx) {
    const { state, now } = await loadState(ctx);
    return <AppShell state={state} now={now}>{children}</AppShell>;
  }
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" aria-label="interval, home"><Wordmark size="md" /></Link>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm"><a href="/demo">Explore demo</a></Button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 pb-16 md:px-10">{children}</main>
    </div>
  );
}
