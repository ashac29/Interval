/**
 * Transactional email adapter (CUSTOMIZABLE provider: EMAIL_PROVIDER).
 * `resend` is implemented over fetch. With no provider configured the
 * adapter reports `configured: false` and the app shows a PREVIEW, never a
 * false "sent".
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}
export interface EmailResult {
  ok: boolean;
  transient?: boolean;
  error?: string;
}
export interface EmailAdapter {
  id: string;
  configured: boolean;
  send(msg: EmailMessage): Promise<EmailResult>;
}

export const previewEmailAdapter: EmailAdapter = {
  id: "preview",
  configured: false,
  async send() {
    return { ok: false, error: "Email provider not configured" };
  },
};

export function resendAdapter(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailAdapter {
  return {
    id: "resend",
    configured: true,
    async send(msg) {
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
          body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
        });
        if (res.ok) return { ok: true };
        return { ok: false, transient: res.status >= 500 || res.status === 429, error: `Provider responded ${res.status}` };
      } catch {
        return { ok: false, transient: true, error: "Network error" };
      }
    },
  };
}
