import type { AppState } from "@/lib/domain/types";

/**
 * Persistence port. All reads/writes of AppState go through `mutate`, which
 * guarantees SERIALIZED read-modify-write per state id:
 *  - memory store: per-id promise queue
 *  - Supabase store: optimistic concurrency (compare-and-set on `version`) with retry
 * A mutation whose result has `ok: false` is discarded (not persisted).
 * Because policy validation runs INSIDE the serialized section, two concurrent
 * "accept" actions can never both pass the daily cap.
 */
export interface StateStore {
  readonly kind: "memory" | "supabase";
  get(id: string): Promise<AppState | null>;
  create(id: string, state: AppState): Promise<void>;
  mutate<T>(id: string, fn: (state: AppState) => T | Promise<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export const shouldCommit = (result: unknown): boolean => !(typeof result === "object" && result !== null && "ok" in result && (result as { ok: unknown }).ok === false);

export class StateNotFoundError extends Error {
  constructor(id: string) {
    super(`State not found: ${id}`);
  }
}
