import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { Wordmark } from "@/components/brand/wordmark";
import { googleConfigured } from "@/lib/env";
import { pageData } from "@/lib/session";
import { prefsValues } from "@/lib/prefs-values";

export const metadata: Metadata = { title: "Set up" };

export default async function Onboarding() {
  const { state } = await pageData();
  if (state.profile.onboarded && state.mode === "live") redirect("/today");
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="mb-10"><Wordmark size="md" /></div>
      <OnboardingWizard initial={prefsValues(state)} demo={state.mode === "demo"} displayName={state.profile.displayName} googleReady={googleConfigured()} signedInLive={state.mode === "live"} />
    </div>
  );
}
