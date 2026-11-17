import { deterministicBrief } from "@/lib/domain/brief";
import { mockParsePreferences } from "@/lib/domain/prefs-nl";
import type { AiProvider, BriefInput, ClassifyInput, PrefParseInput } from "./provider";

/**
 * Deterministic mock AI used in demo mode and whenever no model credentials
 * exist. It is explicit about being a mock: callers tag results `mock_llm`
 * and the UI labels them "demo AI". Same input -> same output.
 */
export const mockAi: AiProvider = {
  id: "mock",
  model: "deterministic-mock",
  isMock: true,
  async classifyEvent(input: ClassifyInput) {
    const t = input.title.toLowerCase();
    if (/\b(compliance|onboarding|mandatory|security|show|review|budget)\b/.test(t)) {
      return { category: "other", workoutType: null, confidence: 0.8, reason: "Looks like a work or admin event.", needsConfirmation: false };
    }
    if (/\b(session with|pt|personal|practice|class|lesson|club|training|sweat|reformer|conditioning|cardio)\b/.test(t)) {
      return {
        category: "workout",
        workoutType: /\bpt|personal\b/.test(t) ? "strength" : "workout",
        confidence: 0.62,
        reason: "The title could be a workout or coaching session, but it isn’t clear.",
        needsConfirmation: true,
      };
    }
    if (/\brun\b/.test(t)) {
      return { category: "unclear", workoutType: null, confidence: 0.45, reason: "“Run” might mean exercise or something else.", needsConfirmation: true };
    }
    return { category: "unclear", workoutType: null, confidence: 0.4, reason: "Not enough information in the title.", needsConfirmation: true };
  },
  async parsePreferences(input: PrefParseInput) {
    return mockParsePreferences(input.text);
  },
  async writeBrief(input: BriefInput) {
    return deterministicBrief(input);
  },
};
