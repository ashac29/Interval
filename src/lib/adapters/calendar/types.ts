/** Calendar provider port + the minimal raw event shape we ever read from Google. */

export interface RawGoogleEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: "opaque" | "transparent";
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string; timeZone?: string };
  updated?: string;
  eventType?: string;
  /** Reduced by the provider to the user's own response. Never the attendee list. */
  selfResponse?: "accepted" | "declined" | "tentative" | "needsAction" | null;
}

export interface ListEventsParams {
  timeMin?: string;
  timeMax?: string;
  syncToken?: string;
  pageToken?: string;
  pageSize?: number;
}

export interface ListEventsResult {
  items: RawGoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface CalendarProvider {
  listCalendars(): Promise<{ id: string; name: string; primary?: boolean }[]>;
  listEvents(calendarId: string, params: ListEventsParams): Promise<ListEventsResult>;
}

/** HTTP 410: the incremental sync token is no longer valid; do a full resync. */
export class SyncTokenExpiredError extends Error {
  constructor() {
    super("Sync token expired");
    this.name = "SyncTokenExpiredError";
  }
}
/** 401/403: credentials revoked, expired or lacking scope; the user must reconnect. */
export class AuthorizationError extends Error {
  constructor(message = "Calendar authorization failed") {
    super(message);
    this.name = "AuthorizationError";
  }
}
/** 5xx/429/network: retry later. */
export class TransientError extends Error {
  constructor(message = "Calendar provider temporarily unavailable") {
    super(message);
    this.name = "TransientError";
  }
}
