import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "@/lib/domain/types";
import { shouldCommit, StateNotFoundError, type StateStore } from "./types";

/** Tiny DB port so the concurrency logic is testable without a database. */
export interface SnapshotTable {
  select(id: string): Promise<{ state: AppState; version: number } | null>;
  /** Returns false if a row already exists. */
  insertIfAbsent(id: string, state: AppState, nextJobAt: string | null): Promise<boolean>;
  /** Atomic: update only where version === expectedVersion. Returns false on conflict. */
  compareAndSet(id: string, expectedVersion: number, state: AppState, nextJobAt: string | null): Promise<boolean>;
  delete(id: string): Promise<void>;
  /** Optional: overwrite-or-create (used by demo scenario reset). When present, `create` uses it instead of throwing. */
  upsert?(id: string, state: AppState, nextJobAt: string | null): Promise<void>;
}

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

/** Demo table: text id, `expires_at` refreshed on every write, expired rows read as missing. No next_job_at column. */
export class SupabaseDemoTable implements SnapshotTable {
  constructor(
    private db: SupabaseClient,
    private now: () => Date = () => new Date(),
    private ttlMs = DEMO_TTL_MS,
  ) {}
  private expiry = () => new Date(this.now().getTime() + this.ttlMs).toISOString();
  async select(id: string) {
    const { data, error } = await this.db.from("demo_sessions").select("state,version,expires_at").eq("id", id).maybeSingle();
    if (error) throw new Error(`demo_sessions select failed: ${error.code ?? "error"}`);
    if (!data) return null;
    if (Date.parse(data.expires_at as string) <= this.now().getTime()) {
      await this.db.from("demo_sessions").delete().eq("id", id);
      return null;
    }
    return { state: data.state as AppState, version: data.version as number };
  }
  async insertIfAbsent(id: string, state: AppState) {
    const { error } = await this.db.from("demo_sessions").insert({ id, state, version: state.version ?? 0, expires_at: this.expiry() });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new Error(`demo_sessions insert failed: ${error.code ?? "error"}`);
  }
  async upsert(id: string, state: AppState) {
    const { error } = await this.db.from("demo_sessions").upsert({ id, state, version: state.version ?? 0, expires_at: this.expiry() }, { onConflict: "id" });
    if (error) throw new Error(`demo_sessions upsert failed: ${error.code ?? "error"}`);
  }
  async compareAndSet(id: string, expectedVersion: number, state: AppState) {
    const { data, error } = await this.db
      .from("demo_sessions")
      .update({ state, version: expectedVersion + 1, expires_at: this.expiry() })
      .eq("id", id)
      .eq("version", expectedVersion)
      .select("version");
    if (error) throw new Error(`demo_sessions update failed: ${error.code ?? "error"}`);
    return (data?.length ?? 0) === 1;
  }
  async delete(id: string) {
    const { error } = await this.db.from("demo_sessions").delete().eq("id", id);
    if (error) throw new Error(`demo_sessions delete failed: ${error.code ?? "error"}`);
  }
}

/** Calls the SQL purge function (service role). Returns rows deleted. */
export async function purgeExpiredDemoSessions(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc("purge_expired_demo_sessions");
  if (error) throw new Error(`purge failed: ${error.code ?? "error"}`);
  return Number(data ?? 0);
}

export class SupabaseSnapshotTable implements SnapshotTable {
  constructor(private db: SupabaseClient) {}
  async select(id: string) {
    const { data, error } = await this.db.from("user_state").select("state,version").eq("user_id", id).maybeSingle();
    if (error) throw new Error(`user_state select failed: ${error.code ?? "error"}`);
    return data ? { state: data.state as AppState, version: data.version as number } : null;
  }
  async insertIfAbsent(id: string, state: AppState, nextJobAt: string | null) {
    const { error } = await this.db.from("user_state").insert({ user_id: id, state, version: state.version ?? 0, next_job_at: nextJobAt });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new Error(`user_state insert failed: ${error.code ?? "error"}`);
  }
  async compareAndSet(id: string, expectedVersion: number, state: AppState, nextJobAt: string | null) {
    const { data, error } = await this.db
      .from("user_state")
      .update({ state, version: expectedVersion + 1, next_job_at: nextJobAt, updated_at: new Date().toISOString() })
      .eq("user_id", id)
      .eq("version", expectedVersion)
      .select("version");
    if (error) throw new Error(`user_state update failed: ${error.code ?? "error"}`);
    return (data?.length ?? 0) === 1;
  }
  async delete(id: string) {
    const { error } = await this.db.from("user_state").delete().eq("user_id", id);
    if (error) throw new Error(`user_state delete failed: ${error.code ?? "error"}`);
  }
}

export class SupabaseStateStore implements StateStore {
  readonly kind = "supabase" as const;
  constructor(
    private table: SnapshotTable,
    private maxRetries = 6,
    private db?: SupabaseClient,
  ) {}

  /** User-facing store: pass the RLS-scoped client from `createClient()`. Service variant: pass `createAdminClient()`. */
  static fromClient(db: SupabaseClient) {
    return new SupabaseStateStore(new SupabaseSnapshotTable(db), 6, db);
  }

  async get(id: string) {
    const row = await this.table.select(id);
    return row ? { ...row.state, version: row.version } : null;
  }

  /** Demo store: service-role client, text visitor ids, 24h rolling expiry, `create` overwrites (scenario reset). */
  static forDemo(admin: SupabaseClient) {
    return new SupabaseStateStore(new SupabaseDemoTable(admin), 6);
  }

  async create(id: string, state: AppState) {
    if (this.table.upsert) {
      await this.table.upsert(id, { ...state, version: 0 }, state.nextJobAt ?? null);
      return;
    }
    const ok = await this.table.insertIfAbsent(id, { ...state, version: 0 }, state.nextJobAt ?? null);
    if (!ok) throw new Error("State already exists");
  }

  async mutate<T>(id: string, fn: (state: AppState) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const row = await this.table.select(id);
      if (!row) throw new StateNotFoundError(id);
      const draft = structuredClone(row.state);
      draft.version = row.version;
      const result = await fn(draft);
      if (!shouldCommit(result)) return result;
      draft.version = row.version + 1;
      if (await this.table.compareAndSet(id, row.version, draft, draft.nextJobAt ?? null)) return result;
      // Lost the race: reload fresh state and re-run validation.
    }
    throw new Error("Could not save after repeated concurrent updates. Please retry.");
  }

  async delete(id: string) {
    await this.table.delete(id);
  }

  /** Service role only: users whose reminders are due. */
  async listDueUserIds(now: Date, limit = 200): Promise<string[]> {
    if (!this.db) throw new Error("listDueUserIds needs a client");
    const { data, error } = await this.db.from("user_state").select("user_id").not("next_job_at", "is", null).lte("next_job_at", now.toISOString()).limit(limit);
    if (error) throw new Error(`listDueUserIds failed: ${error.code ?? "error"}`);
    return (data ?? []).map((r) => r.user_id as string);
  }
}
