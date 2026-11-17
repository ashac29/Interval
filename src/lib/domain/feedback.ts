import { policy } from "@/config/policy";
import { newId } from "./ids";
import type { AppState, FeedbackEvent, FeedbackType } from "./types";

/**
 * Append-only feedback events. Undo never edits history: it appends a new
 * event with `compensates` pointing at the original.
 *
 * `silent` events (planner-generated exposure bookkeeping) are NOT recorded:
 * real exposure is recorded when the user actually sees a suggestion
 * (see recordExposure in actions.ts).
 */
export function recordFeedback(
  state: AppState,
  type: FeedbackType,
  data: FeedbackEvent["data"],
  now: Date,
  recId?: string,
  silent = false,
  compensates?: string,
): FeedbackEvent | null {
  if (silent) return null;
  const ev: FeedbackEvent = { id: newId("fb"), type, at: now.toISOString(), data, ...(recId ? { recId } : {}), ...(compensates ? { compensates } : {}) };
  state.feedback.push(ev);
  if (state.feedback.length > policy.retention.feedbackMaxEvents) state.feedback.splice(0, state.feedback.length - policy.retention.feedbackMaxEvents);
  return ev;
}
