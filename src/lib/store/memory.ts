import type { AppState } from "@/lib/domain/types";
import { shouldCommit, StateNotFoundError, type StateStore } from "./types";

interface Entry {
  json: string;
  touched: number;
  queue: Promise<unknown>;
}

/**
 * In-memory store. Used for isolated per-visitor DEMO sessions: each visitor
 * has an unguessable id (httpOnly cookie) and their own state. Not shared,
 * not durable across server restarts or serverless instances — that's by
 * design for demo data. See README for the Supabase-backed demo option.
 */
export class MemoryStateStore implements StateStore {
  readonly kind = "memory" as const;
  private entries = new Map<string, Entry>();
  constructor(
    private ttlMs = 6 * 60 * 60 * 1000,
    private maxEntries = 500,
  ) {}

  private sweep() {
    const now = Date.now();
    for (const [id, e] of this.entries) if (now - e.touched > this.ttlMs) this.entries.delete(id);
    if (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].touched - b[1].touched).slice(0, this.entries.size - this.maxEntries);
      for (const [id] of oldest) this.entries.delete(id);
    }
  }

  async get(id: string): Promise<AppState | null> {
    const e = this.entries.get(id);
    if (!e) return null;
    e.touched = Date.now();
    return JSON.parse(e.json) as AppState;
  }

  async create(id: string, state: AppState): Promise<void> {
    this.sweep();
    this.entries.set(id, { json: JSON.stringify(state), touched: Date.now(), queue: Promise.resolve() });
  }

  async mutate<T>(id: string, fn: (state: AppState) => T | Promise<T>): Promise<T> {
    const e = this.entries.get(id);
    if (!e) throw new StateNotFoundError(id);
    const run = async (): Promise<T> => {
      const draft = JSON.parse(e.json) as AppState;
      const result = await fn(draft);
      if (shouldCommit(result)) {
        draft.version = (draft.version ?? 0) + 1;
        e.json = JSON.stringify(draft);
      }
      e.touched = Date.now();
      return result;
    };
    const p = e.queue.then(run, run);
    e.queue = p.catch(() => undefined);
    return p;
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }
}
