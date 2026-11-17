import { describe, expect, it } from "vitest";
import { SupabaseDemoTable, SupabaseStateStore, type SnapshotTable } from "@/lib/store/supabase";
import { createInitialState } from "@/lib/domain/state";
import type { AppState } from "@/lib/domain/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Fake with demo-table semantics: upsert, rolling expiry, expired = missing, no next_job_at. */
class FakeDemo implements SnapshotTable {
  rows = new Map<string, { state: AppState; version: number; expires: number }>();
  t = 1_000;
  ttl = 24 * 3600_000;
  async select(id: string) {
    const r = this.rows.get(id);
    await new Promise((res) => setTimeout(res, Math.random() * 3));
    if (!r) return null;
    if (r.expires <= this.t) {
      this.rows.delete(id);
      return null;
    }
    return { state: structuredClone(r.state), version: r.version };
  }
  async insertIfAbsent(id: string, state: AppState) {
    if (this.rows.has(id)) return false;
    this.rows.set(id, { state: structuredClone(state), version: state.version, expires: this.t + this.ttl });
    return true;
  }
  async upsert(id: string, state: AppState) {
    this.rows.set(id, { state: structuredClone(state), version: state.version, expires: this.t + this.ttl });
  }
  async compareAndSet(id: string, expected: number, state: AppState) {
    const r = this.rows.get(id);
    if (!r || r.version !== expected) return false;
    this.rows.set(id, { state: structuredClone(state), version: expected + 1, expires: this.t + this.ttl });
    return true;
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

const mk = () => createInitialState({ mode: "demo", timezone: "America/Chicago", now: new Date("2026-11-17T12:00:00Z") });
const setup = async () => {
  const t = new FakeDemo();
  const s = new SupabaseStateStore(t, 20);
  await s.create("visitor-1", mk());
  return { t, s };
};

describe("demo store (demo_sessions semantics)", () => {
  it("serializes concurrent mutates", async () => {
    const { s } = await setup();
    await Promise.all(Array.from({ length: 8 }, (_, i) => s.mutate("visitor-1", (st) => { st.profile.displayName += `${i}`; return { ok: true }; })));
    const f = (await s.get("visitor-1"))!;
    expect(f.profile.displayName).toHaveLength(8);
    expect(f.version).toBe(8);
  });

  it("does not persist ok:false results", async () => {
    const { s } = await setup();
    await s.mutate("visitor-1", (st) => { st.profile.displayName = "leak"; return { ok: false as const }; });
    expect((await s.get("visitor-1"))!.profile.displayName).toBe("");
  });

  it("create overwrites (scenario reset) instead of throwing", async () => {
    const { s } = await setup();
    await s.mutate("visitor-1", (st) => { st.profile.displayName = "edited"; return { ok: true }; });
    await s.create("visitor-1", mk());
    const f = (await s.get("visitor-1"))!;
    expect(f.profile.displayName).toBe("");
    expect(f.version).toBe(0);
  });

  it("expired rows read as missing; writes refresh the 24h expiry", async () => {
    const { t, s } = await setup();
    t.t += 23 * 3600_000;
    await s.mutate("visitor-1", (st) => { st.profile.displayName = "x"; return { ok: true }; });
    t.t += 23 * 3600_000; // 46h after creation but only 23h after last write
    expect(await s.get("visitor-1")).not.toBeNull();
    t.t += 2 * 3600_000;
    expect(await s.get("visitor-1")).toBeNull();
    await expect(s.mutate("visitor-1", () => 1)).rejects.toThrow(/not found/i);
  });

  it("visitors are isolated by id", async () => {
    const { s } = await setup();
    await s.create("visitor-2", mk());
    await s.mutate("visitor-1", (st) => { st.profile.displayName = "one"; return { ok: true }; });
    expect((await s.get("visitor-2"))!.profile.displayName).toBe("");
  });

  it("demo table never writes next_job_at and refreshes expires_at (payload check)", async () => {
    const payloads: Record<string, unknown>[] = [];
    const chain = (res: unknown) => {
      const c: Record<string, unknown> = {};
      for (const m of ["eq", "select"]) c[m] = () => c;
      (c as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(res).then(f);
      return c;
    };
    const fake = {
      from: () => ({
        update: (p: Record<string, unknown>) => (payloads.push(p), chain({ data: [{ version: 1 }], error: null })),
        upsert: (p: Record<string, unknown>) => (payloads.push(p), chain({ error: null })),
      }),
    } as unknown as SupabaseClient;
    const table = new SupabaseDemoTable(fake, () => new Date("2026-11-17T00:00:00Z"));
    await table.compareAndSet("a", 0, mk());
    await table.upsert("a", mk());
    expect(payloads).toHaveLength(2);
    for (const p of payloads) {
      expect(p).not.toHaveProperty("next_job_at");
      expect(p.expires_at).toBe("2026-11-18T00:00:00.000Z");
    }
  });
});
