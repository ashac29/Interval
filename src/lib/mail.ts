import { previewEmailAdapter, resendAdapter, type EmailAdapter } from "@/lib/adapters/email";
import { getEnv, emailConfigured } from "@/lib/env";

/** Email adapter selection (CUSTOMIZABLE via EMAIL_PROVIDER). Unconfigured => preview-only, never "sent". */
export function getEmailAdapter(mode: "demo" | "live"): EmailAdapter {
  if (mode === "demo" || !emailConfigured()) return previewEmailAdapter;
  const env = getEnv();
  return resendAdapter(env.resendApiKey as string, env.emailFrom as string);
}
