import type { Flavor, CaffeineInfo } from "@/config/products";

export type Iso = string; // UTC instant, e.g. 2026-11-17T15:00:00.000Z
export type LocalDate = string; // YYYY-MM-DD in the planning timezone
export type Provenance = "explicit" | "confirmed_interpretation" | "inferred";

export interface Interval {
  startMs: number;
  endMs: number;
}

/* ───────────── Preferences ───────────── */

export type TimingPref = "before" | "after" | "either";

export interface Preferences {
  flavorRank: Flavor[];
  timing: TimingPref;
  busyDaySuggestions: boolean;
  /** User-chosen cap; can only be <= policy.maxDrinksPerDay. */
  maxDrinksPerDay: number;
  reminders: { inApp: boolean; email: boolean; emailAddress: string | null; leadMinutes: number };
  quietHours: { start: string; end: string };
  caffeineCeilingMg: number;
  caffeineCutoff: string;
  dietary: string[];
  timezone: string;
  /** Weekdays (0=Sun) the user has CONFIRMED as office days. null = unknown; never inferred. */
  officeDays: number[] | null;
  flavorByDayType: { office?: Flavor };
  busyHoursThreshold: number;
  provenance: Record<string, Provenance>;
}

/* ───────────── Calendar ───────────── */

export interface CalEvent {
  key: string; // provider:calendarId:eventId  (idempotency key)
  provider: "google" | "demo";
  calendarId: string;
  eventId: string;
  title: string;
  startUtc: Iso;
  endUtc: Iso;
  allDay: boolean;
  timezone: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  transparency: "opaque" | "transparent";
  selfResponse: "accepted" | "declined" | "tentative" | "needsAction" | null;
  recurringEventId?: string;
  originalStartUtc?: Iso;
}

export interface CalendarInfo {
  id: string;
  name: string;
  selected: boolean;
  syncToken?: string | null;
}

export type CalendarStatus = "not_connected" | "connected" | "needs_reconnect" | "syncing" | "error";

export interface CalendarConnection {
  status: CalendarStatus;
  provider: "google" | "demo" | null;
  /** Demo connections are fixtures, never a live link. */
  isDemo: boolean;
  calendars: CalendarInfo[];
  lastSyncAt: Iso | null;
  lastSyncSummary: string | null;
  lastError: string | null;
  nextSyncAt: Iso | null;
  syncIntervalMinutes: number;
  /** Minimal list of consent facts for the account screen. */
  scopes: string[];
}

export type ClassificationSource = "keyword" | "llm" | "mock_llm" | "title_mapping" | "user_confirmed" | "user_override";

export interface Classification {
  category: "workout" | "other" | "unclear";
  workoutType: string | null;
  confidence: number;
  reason: string;
  needsConfirmation: boolean;
  source: ClassificationSource;
  version: string;
}

export interface TitleMapping {
  /** normalized title */
  title: string;
  category: "workout" | "other";
  workoutType: string | null;
  createdAt: Iso;
}

export type Interpretation =
  | { kind: "workout"; workoutType: string; classification: Classification; confirmed: boolean }
  | { kind: "not_workout"; classification: Classification }
  | { kind: "needs_confirmation"; classification: Classification };

/* ───────────── Recommendations ───────────── */

export type RecStatus = "proposed" | "accepted" | "dismissed" | "completed" | "expired" | "invalidated";
export type RecKind = "post_workout" | "pre_workout" | "busy_gap";

export interface ScoreBreakdown {
  total: number;
  parts: { code: string; value: number; label: string }[];
}

export interface Recommendation {
  id: string;
  localDate: LocalDate;
  flavor: Flavor;
  startUtc: Iso;
  kind: RecKind;
  status: RecStatus;
  /** Calendar event keys this suggestion depends on (workout). */
  eventRefs: string[];
  /** Workout end/start it was derived from, to detect rescheduling. */
  anchorUtc: Iso | null;
  reasonCodes: string[];
  reason: string;
  score: ScoreBreakdown;
  scoringVersion: string;
  policyVersion: string;
  caffeine: CaffeineInfo;
  source: "engine" | "manual";
  manual: { timeEdited: boolean; flavorEdited: boolean };
  conflict: { code: string; message: string } | null;
  createdAt: Iso;
  updatedAt: Iso;
  acceptedAt?: Iso;
  completedAt?: Iso;
  dismissedReason?: DismissReason;
  consumptionId?: string;
  /** Status before "Had one", so undo restores exactly what it was (never silently accepts). */
  priorStatus?: "proposed" | "accepted" | "expired";
}

export const DISMISS_REASONS = [
  { id: "wrong_time", label: "Wrong time" },
  { id: "wrong_flavor", label: "Wrong flavor" },
  { id: "didnt_work_out", label: "Didn’t work out" },
  { id: "already_had", label: "Already had something" },
  { id: "too_many_reminders", label: "Too many reminders" },
  { id: "other", label: "Other" },
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number]["id"];

export interface DayPlanNote {
  date: LocalDate;
  /** Why a day has zero (or fewer) suggestions. */
  reasonCodes: string[];
  messages: string[];
  busyHours: number;
  workouts: number;
}

export interface PlanRun {
  id: string;
  at: Iso;
  trigger: string;
  policyVersion: string;
  scoringVersion: string;
  days: DayPlanNote[];
  created: number;
  invalidated: number;
  expired: number;
  kept: number;
}

/* ───────────── Logs ───────────── */

export interface ConsumptionLog {
  id: string;
  flavor: Flavor;
  at: Iso;
  localDate: LocalDate;
  caffeine: CaffeineInfo;
  recommendationId: string | null;
  idempotencyKey: string;
  voidedAt: Iso | null;
}

export interface ExternalCaffeineLog {
  id: string;
  label: string;
  mg: number | null; // null = unknown amount
  at: Iso;
  localDate: LocalDate;
  voidedAt: Iso | null;
}

export type InventoryReason = "shipment" | "consumption" | "correction" | "consumption_undo" | "order";
export interface InventoryTx {
  id: string;
  flavor: Flavor;
  delta: number;
  reason: InventoryReason;
  basis: "logged" | "estimated";
  at: Iso;
  ref?: string;
}

/* ───────────── Commerce (simulated) ───────────── */

export type ShipmentStatus = "scheduled" | "skipped" | "delivered";
export interface SimShipment {
  id: string;
  date: LocalDate;
  status: ShipmentStatus;
  mix: Record<Flavor, number>;
  note?: string;
}
export interface SimSubscription {
  status: "none" | "active" | "paused";
  cadence: "monthly";
  cans: number;
  priceCents: number;
  mix: Record<Flavor, number>;
  shipments: SimShipment[];
  updatedAt: Iso | null;
}
export interface SimOrder {
  id: string;
  number: string;
  offer: "trial" | "subscription";
  cans: number;
  priceCents: number;
  mix: Record<Flavor, number>;
  placedAt: Iso;
  shipTo: { name: string; city: string };
  status: "placed" | "delivered";
  simulated: true;
}

/* ───────────── Feedback loop ───────────── */

export type FeedbackType =
  | "rec_exposed"
  | "rec_accepted"
  | "rec_acceptance_undone"
  | "rec_rescheduled"
  | "rec_flavor_changed"
  | "rec_dismissed"
  | "rec_completed"
  | "rec_invalidated"
  | "classification_corrected"
  | "consumption_logged"
  | "consumption_undone"
  | "pref_change_confirmed"
  | "pref_change_undone"
  | "pref_parse_corrected"
  | "weekly_plan_edited"
  | "notification_optout"
  | "inventory_corrected"
  | "replenishment_accepted"
  | "replenishment_dismissed";

export interface FeedbackEvent {
  id: string;
  type: FeedbackType;
  at: Iso;
  recId?: string;
  /** Minimal, non-sensitive reference data (codes, ids, flavors, minute offsets). Never raw titles. */
  data: Record<string, string | number | boolean | null>;
  /** Append-only: undo is a new event pointing at the one it compensates. */
  compensates?: string;
}

/* ───────────── Preferences NL / history ───────────── */

export interface PrefChangeRecord {
  id: string;
  at: Iso;
  /** Verbatim request is NOT stored; only a short summary of what changed. */
  summary: string;
  before: Partial<Preferences>;
  after: Partial<Preferences>;
  undoneAt: Iso | null;
}

/* ───────────── Reminders ───────────── */

export type ReminderStatus = "pending" | "sent" | "cancelled" | "failed" | "skipped" | "previewed";
export interface ReminderJob {
  id: string;
  recommendationId: string;
  channel: "in_app" | "email";
  /** Deterministic key: one send per (rec, scheduled drink time, channel). */
  dedupeKey: string;
  runAt: Iso;
  drinkAtUtc: Iso;
  status: ReminderStatus;
  attempts: number;
  lastError?: string;
  cancelReason?: string;
  processedAt?: Iso;
  /** Test/demo hook: number of transient failures to simulate before success. */
  simulateFailures?: number;
}

export interface InAppNotice {
  id: string;
  at: Iso;
  title: string;
  body: string;
  recommendationId: string | null;
  read: boolean;
  jobId?: string;
}

export interface EmailPreview {
  id: string;
  at: Iso;
  to: string | null;
  subject: string;
  text: string;
  /** "previewed" = provider not configured, nothing was delivered. */
  status: "previewed" | "sent";
  jobId?: string;
}

/* ───────────── Root state ───────────── */

export interface WeeklyBrief {
  weekStart: LocalDate;
  generatedAt: Iso;
  source: "deterministic" | "mock_llm" | "llm";
  headline: string;
  paragraphs: string[];
  referencedRecommendationIds: string[];
}

export interface ReplenishmentDecision {
  id: string;
  at: Iso;
  action: string;
  accepted: boolean;
}

export interface AppState {
  schema: number;
  mode: "demo" | "live";
  scenario: string | null;
  /** Demo only: frozen simulated clock. Live mode always uses the real clock. */
  demoNowIso: Iso | null;
  /** Demo/test product caffeine overrides (always illustrative or unknown). */
  caffeineOverrides: Partial<Record<Flavor, CaffeineInfo>>;
  profile: { displayName: string; onboarded: boolean; createdAt: Iso };
  prefs: Preferences;
  calendar: CalendarConnection;
  events: CalEvent[];
  classificationCache: Record<string, Classification>;
  titleMappings: TitleMapping[];
  /** Explicit per-event overrides: key -> workout/not_workout (+type). */
  eventOverrides: Record<string, { category: "workout" | "other"; workoutType: string | null; at: Iso }>;
  recommendations: Recommendation[];
  planRuns: PlanRun[];
  feedback: FeedbackEvent[];
  consumption: ConsumptionLog[];
  externalCaffeine: ExternalCaffeineLog[];
  inventory: InventoryTx[];
  stockCorrectedAt: Partial<Record<Flavor, Iso>>;
  subscription: SimSubscription;
  orders: SimOrder[];
  reminders: ReminderJob[];
  notices: InAppNotice[];
  emailPreviews: EmailPreview[];
  prefChanges: PrefChangeRecord[];
  /** Last previewed natural-language change, held server-side. Confirmation applies THIS, never a client-supplied patch. */
  pendingPref: { id: string; at: Iso; summary: string; patch: Partial<Preferences>; diff: { label: string; before: string; after: string }[] } | null;
  replenishment: ReplenishmentDecision[];
  briefs: WeeklyBrief[];
  /** Next instant a background job should look at this state (indexed column in live DB). */
  nextJobAt: Iso | null;
  version: number;
}

export const STATE_SCHEMA = 1;
