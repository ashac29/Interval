import { z } from "zod";
import { FLAVORS } from "@/config/products";

/**
 * Schemas for every structured model output. Model output is NEVER trusted:
 * it is parsed here, then validated again by deterministic policy code.
 */

export const ClassificationOutputSchema = z.object({
  category: z.enum(["workout", "other", "unclear"]),
  workoutType: z.string().max(40).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240),
  needsConfirmation: z.boolean(),
});
export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

/** Preference fields the NL feature may touch. Anything else is "unsupported". */
export const SUPPORTED_PREF_FIELDS = [
  "quietHoursEnd",
  "quietHoursStart",
  "timing",
  "busyDaySuggestions",
  "maxDrinksPerDay",
  "caffeineCutoff",
  "caffeineCeilingMg",
  "flavorRank",
  "flavorOnOfficeDays",
  "officeDays",
  "remindersEmail",
  "remindersInApp",
  "reminderLeadMinutes",
] as const;
export type SupportedPrefField = (typeof SUPPORTED_PREF_FIELDS)[number];

export const PrefChangeSchema = z.object({
  field: z.enum(SUPPORTED_PREF_FIELDS),
  value: z.union([z.string().max(40), z.number(), z.boolean(), z.array(z.union([z.string().max(20), z.number()])).max(7)]),
});

export const PrefParseOutputSchema = z.object({
  intent: z.enum(["update", "clarify", "unsupported"]),
  changes: z.array(PrefChangeSchema).max(6),
  clarification: z.string().max(240).nullable(),
  options: z.array(z.string().max(40)).max(8).nullable(),
  unsupportedReason: z.string().max(240).nullable(),
});
export type PrefParseOutput = z.infer<typeof PrefParseOutputSchema>;

export const BriefOutputSchema = z.object({
  headline: z.string().min(3).max(90),
  paragraphs: z.array(z.string().min(1).max(420)).min(1).max(4),
  referencedRecommendationIds: z.array(z.string().max(80)).max(20),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

export const FlavorEnum = z.enum(FLAVORS);
