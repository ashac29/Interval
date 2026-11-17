import type { AppState } from "@/lib/domain/types";
import { DemoCalendarProvider } from "./demo";
import { GoogleCalendarProvider } from "./google";
import type { CalendarProvider } from "./types";

export * from "./types";
export { syncCalendars, toCalEvent, type SyncOptions, type SyncResult } from "./sync";
export { buildAuthUrl, signOAuthState, verifyOAuthState, exchangeCode, refreshAccessToken, revokeToken, type TokenSet } from "./oauth";
export { GoogleCalendarProvider, DemoCalendarProvider };

/** Demo state -> fixture provider (never live). Live -> Google with a fresh access token (throws without one). */
export function getCalendarProvider(state: Pick<AppState, "mode" | "events" | "calendar">, accessToken?: string, fetchImpl?: typeof fetch): CalendarProvider {
  if (state.mode === "demo") return new DemoCalendarProvider(state);
  if (!accessToken) throw new Error("A Google access token is required for live calendar sync");
  return new GoogleCalendarProvider(accessToken, fetchImpl);
}
