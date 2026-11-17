import { z } from "zod";
import { aiDefaults, syncDefaults } from "@/config/policy";
import { FLAVORS } from "@/config/products";
import { configureVerifiedCaffeine } from "@/lib/domain/catalog";
import type { CaffeineInfo, Flavor } from "@/config/products";

/**
 * Server-side environment access (CUSTOMIZABLE: LLM, email, sync, caffeine).
 * Never throws at import. Never exposes secrets through `capabilities()`.
 */

const intOr = (v: string | undefined, d: number, min = 1, max = 100_000) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};
const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

const CaffeineJson = z.record(
  z.enum(FLAVORS),
  z.object({ mg: z.number().min(0).max(1000), status: z.literal("verified") }),
);

export function parseVerifiedCaffeine(json: string | undefined): Partial<Record<Flavor, CaffeineInfo>> {
  if (!nonEmpty(json)) return {};
  try {
    const parsed = CaffeineJson.safeParse(JSON.parse(json as string));
    return parsed.success ? (parsed.data as Partial<Record<Flavor, CaffeineInfo>>) : {};
  } catch {
    return {};
  }
}

export interface Env {
  appUrl: string | null;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  anthropicApiKey?: string;
  llmProvider: string;
  llmModel: string;
  llmApiBaseUrl: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  oauthStateSecret?: string;
  tokenEncryptionKey?: string;
  emailProvider: "resend" | "none";
  resendApiKey?: string;
  emailFrom?: string;
  cronSecret?: string;
  sync: { intervalMinutes: number; pastDays: number; futureDays: number };
  demoStore: "memory" | "supabase";
}

let configured = false;

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  const e = source;
  const vercel = nonEmpty(e.VERCEL_PROJECT_PRODUCTION_URL) ?? nonEmpty(e.VERCEL_URL);
  const appUrl = nonEmpty(e.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "") ?? (vercel ? `https://${vercel}` : null);
  if (source === process.env && !configured) {
    configured = true;
    configureVerifiedCaffeine(parseVerifiedCaffeine(e.PRODUCT_CAFFEINE_JSON));
  }
  return {
    appUrl,
    supabaseUrl: nonEmpty(e.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: nonEmpty(e.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: nonEmpty(e.SUPABASE_SERVICE_ROLE_KEY),
    anthropicApiKey: nonEmpty(e.ANTHROPIC_API_KEY),
    llmProvider: nonEmpty(e.LLM_PROVIDER) ?? aiDefaults.provider,
    llmModel: nonEmpty(e.LLM_MODEL) ?? aiDefaults.model,
    llmApiBaseUrl: (nonEmpty(e.LLM_API_BASE_URL) ?? "https://api.anthropic.com").replace(/\/$/, ""),
    googleClientId: nonEmpty(e.GOOGLE_CLIENT_ID),
    googleClientSecret: nonEmpty(e.GOOGLE_CLIENT_SECRET),
    googleRedirectUri: nonEmpty(e.GOOGLE_OAUTH_REDIRECT_URI),
    oauthStateSecret: nonEmpty(e.OAUTH_STATE_SECRET),
    tokenEncryptionKey: nonEmpty(e.TOKEN_ENCRYPTION_KEY),
    emailProvider: nonEmpty(e.EMAIL_PROVIDER) === "resend" ? "resend" : "none",
    resendApiKey: nonEmpty(e.RESEND_API_KEY),
    emailFrom: nonEmpty(e.EMAIL_FROM),
    cronSecret: nonEmpty(e.CRON_SECRET),
    sync: {
      intervalMinutes: intOr(e.CALENDAR_SYNC_INTERVAL_MINUTES, syncDefaults.intervalMinutes, 5, 1440),
      pastDays: intOr(e.CALENDAR_PAST_DAYS, syncDefaults.pastDays, 0, 90),
      futureDays: intOr(e.CALENDAR_FUTURE_DAYS, syncDefaults.futureDays, 1, 90),
    },
    demoStore: nonEmpty(e.DEMO_STORE) === "supabase" ? "supabase" : "memory",
  };
}

/** Redirect URI for the Google OAuth callback. Prefers explicit override, then app URL, then the request origin. */
export function googleRedirectUri(requestOrigin?: string): string | null {
  const env = getEnv();
  if (env.googleRedirectUri) return env.googleRedirectUri;
  const base = env.appUrl ?? requestOrigin?.replace(/\/$/, "") ?? null;
  return base ? `${base}/api/calendar/google/callback` : null;
}

export const supabaseConfigured = () => {
  const e = getEnv();
  return Boolean(e.supabaseUrl && e.supabaseAnonKey);
};
export const serviceRoleConfigured = () => supabaseConfigured() && Boolean(getEnv().supabaseServiceRoleKey);
export const googleConfigured = () => {
  const e = getEnv();
  return Boolean(e.googleClientId && e.googleClientSecret && e.oauthStateSecret && e.tokenEncryptionKey);
};
export const llmConfigured = () => {
  const e = getEnv();
  return e.llmProvider === "anthropic" && Boolean(e.anthropicApiKey);
};
export const emailConfigured = () => {
  const e = getEnv();
  return e.emailProvider === "resend" && Boolean(e.resendApiKey && e.emailFrom);
};

/** Booleans/labels only, safe to pass to client components. */
export function capabilities() {
  const e = getEnv();
  return {
    auth: supabaseConfigured(),
    liveStorage: serviceRoleConfigured() || supabaseConfigured(),
    googleCalendar: googleConfigured(),
    llm: llmConfigured(),
    llmProvider: e.llmProvider,
    llmModel: llmConfigured() ? e.llmModel : null,
    email: emailConfigured(),
    emailProvider: emailConfigured() ? e.emailProvider : "none",
    jobs: Boolean(e.cronSecret),
    verifiedCaffeine: Object.keys(parseVerifiedCaffeine(process.env.PRODUCT_CAFFEINE_JSON)).length > 0,
    syncIntervalMinutes: e.sync.intervalMinutes,
  };
}
export type Capabilities = ReturnType<typeof capabilities>;
