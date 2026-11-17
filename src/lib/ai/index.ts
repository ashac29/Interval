import { getEnv, llmConfigured } from "@/lib/env";
import { anthropicAi } from "./anthropic";
import { mockAi } from "./mock";
import type { AiProvider } from "./provider";

/** Demo ALWAYS uses the deterministic mock. Live uses the configured provider, else the mock. */
export function getAi(mode: "demo" | "live"): AiProvider {
  if (mode === "demo" || !llmConfigured()) return mockAi;
  const env = getEnv();
  return anthropicAi({ apiKey: env.anthropicApiKey as string, model: env.llmModel, baseUrl: env.llmApiBaseUrl });
}

export function aiStatus(mode: "demo" | "live"): { provider: string; model: string; isMock: boolean; label: string } {
  const ai = getAi(mode);
  return {
    provider: ai.id,
    model: ai.model,
    isMock: ai.isMock,
    label: ai.isMock ? "Demo AI (deterministic, no model calls)" : `${ai.id} · ${ai.model}`,
  };
}
