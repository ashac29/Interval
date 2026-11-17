import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { pageData } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, now } = await pageData();
  if (state.mode === "live" && !state.profile.onboarded) redirect("/onboarding");
  return <AppShell state={state} now={now}>{children}</AppShell>;
}
