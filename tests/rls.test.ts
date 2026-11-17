import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SupabaseStateStore, type SnapshotTable } from "@/lib/store/supabase";
import type { AppState } from "@/lib/domain/types";
import { createInitialState } from "@/lib/domain/state";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const dir = path.resolve(import.meta.dirname, "../supabase");

const STUB = `
create schema if not exists auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

let db: PGlite;

async function as<T>(role: "anon" | "authenticated" | "service_role" | "postgres", uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
const q = (sql: string) => db.query<Record<string, unknown>>(sql);
const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return /permission denied|row-level security/i.test(String(e));
  }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const f of readdirSync(path.join(dir, "migrations")).sort()) await db.exec(readFileSync(path.join(dir, "migrations", f), "utf8"));
  await db.exec(readFileSync(path.join(dir, "seed.sql"), "utf8"));
  await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`); // trigger creates profiles
  await db.exec(`
    insert into user_state (user_id, state) values ('${A}', '{"a":1}'), ('${B}', '{"b":1}');
    insert into calendar_connections (user_id) values ('${A}'), ('${B}');
    insert into feedback_events (user_id, type) values ('${A}', 'rec_accepted'), ('${B}', 'rec_accepted');
    insert into calendar_credentials (user_id, refresh_token_enc) values ('${A}', 'enc-a'), ('${B}', 'enc-b');
    insert into demo_sessions (id, state) values ('d1', '{}');
  `);
});

describe("RLS isolation (PGlite, stubbed auth schema)", () => {
  it("signup trigger creates profiles", async () => {
    expect((await q("select count(*)::int n from profiles")).rows[0]!.n).toBe(2);
  });

  it("user A sees only their own rows in every owner table", async () => {
    for (const t of ["user_state", "calendar_connections", "feedback_events", "profiles"]) {
      const col = t === "profiles" ? "id" : "user_id";
      const rows = await as("authenticated", A, async () => (await q(`select ${col} as u from ${t}`)).rows);
      expect(rows.map((r) => r.u)).toEqual([A]);
    }
  });

  it("user A cannot update or delete B's rows (zero rows affected)", async () => {
    await as("authenticated", A, async () => {
      for (const [t, col] of [["user_state", "user_id"], ["calendar_connections", "user_id"], ["profiles", "id"]] as const) {
        const u = await db.query(`update ${t} set ${col} = ${col} where ${col} = '${B}'`);
        expect(u.affectedRows).toBe(0);
        const d = await db.query(`delete from ${t} where ${col} = '${B}'`);
        expect(d.affectedRows).toBe(0);
      }
    });
    expect((await q("select count(*)::int n from user_state")).rows[0]!.n).toBe(2);
  });

  it("user A cannot insert rows owned by B", async () => {
    await as("authenticated", A, async () => {
      expect(await denied(() => db.query(`insert into feedback_events (user_id, type) values ('${B}', 'x')`))).toBe(true);
      expect(await denied(() => db.query(`insert into calendar_connections (user_id) values ('${B}')`))).toBe(true);
      expect(await denied(() => db.query(`insert into user_state (user_id, state) values ('${B}', '{}')`))).toBe(true);
    });
  });

  it("owners can update their own state, but A's update never touches B", async () => {
    await as("authenticated", A, async () => {
      const u = await db.query(`update user_state set state = '{"a":2}' where user_id = '${A}'`);
      expect(u.affectedRows).toBe(1);
    });
    expect((await q(`select state from user_state where user_id = '${B}'`)).rows[0]!.state).toEqual({ b: 1 });
  });

  it("feedback_events is append-only for owners", async () => {
    await as("authenticated", A, async () => {
      expect((await db.query(`insert into feedback_events (user_id, type) values ('${A}', 'rec_dismissed')`)).affectedRows).toBe(1);
      expect(await denied(() => db.query(`update feedback_events set type = 'x' where user_id = '${A}'`))).toBe(true);
      expect(await denied(() => db.query(`delete from feedback_events where user_id = '${A}'`))).toBe(true);
    });
  });

  it("clients cannot read credentials or demo sessions; anon can read nothing", async () => {
    await as("authenticated", A, async () => {
      expect(await denied(() => db.query("select * from calendar_credentials"))).toBe(true);
      expect(await denied(() => db.query("select * from demo_sessions"))).toBe(true);
      expect(await denied(() => db.query(`insert into calendar_credentials (user_id, refresh_token_enc) values ('${A}', 'x')`))).toBe(true);
    });
    await as("anon", null, async () => {
      for (const t of ["user_state", "calendar_connections", "calendar_credentials", "demo_sessions", "feedback_events", "profiles"]) {
        expect(await denied(() => db.query(`select * from ${t}`))).toBe(true);
      }
    });
  });

  it("service_role can read credentials and run the demo purge", async () => {
    const rows = await as("service_role", null, async () => (await q("select user_id, refresh_token_enc from calendar_credentials order by refresh_token_enc")).rows);
    expect(rows.map((r) => r.refresh_token_enc)).toEqual(["enc-a", "enc-b"]);
    await as("service_role", null, async () => {
      await q("update demo_sessions set expires_at = now() - interval '1 hour'");
      expect((await q("select public.purge_expired_demo_sessions() n")).rows[0]!.n).toBe(1);
    });
    expect(await as("authenticated", A, () => denied(() => q("select public.purge_expired_demo_sessions()")))).toBe(true);
  });

  it("deleting an auth user cascades through every table (privacy deletion)", async () => {
    await db.exec(`delete from auth.users where id = '${A}'`);
    for (const [t, col] of [["user_state", "user_id"], ["calendar_connections", "user_id"], ["calendar_credentials", "user_id"], ["feedback_events", "user_id"], ["profiles", "id"]] as const) {
      expect((await q(`select count(*)::int n from ${t} where ${col} = '${A}'`)).rows[0]!.n).toBe(0);
      expect((await q(`select count(*)::int n from ${t} where ${col} = '${B}'`)).rows[0]!.n).toBe(1);
    }
  });
});

/* ───────── optimistic concurrency of the snapshot store ───────── */

class FakeTable implements SnapshotTable {
  rows = new Map<string, { state: AppState; version: number; nextJobAt: string | null }>();
  casConflicts = 0;
  async select(id: string) {
    const r = this.rows.get(id);
    await new Promise((res) => setTimeout(res, Math.random() * 3)); // interleave concurrent readers
    return r ? { state: structuredClone(r.state), version: r.version } : null;
  }
  async insertIfAbsent(id: string, state: AppState, nextJobAt: string | null) {
    if (this.rows.has(id)) return false;
    this.rows.set(id, { state: structuredClone(state), version: state.version, nextJobAt });
    return true;
  }
  async compareAndSet(id: string, expected: number, state: AppState, nextJobAt: string | null) {
    const r = this.rows.get(id);
    if (!r || r.version !== expected) {
      this.casConflicts++;
      return false;
    }
    this.rows.set(id, { state: structuredClone(state), version: expected + 1, nextJobAt });
    return true;
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

describe("SupabaseStateStore optimistic concurrency", () => {
  const fresh = async () => {
    const t = new FakeTable();
    const s = new SupabaseStateStore(t, 20);
    await s.create("u", createInitialState({ mode: "live", timezone: "America/Chicago", now: new Date("2026-11-17T12:00:00Z") }));
    return { t, s };
  };

  it("serializes concurrent mutates with retries (no lost updates)", async () => {
    const { t, s } = await fresh();
    await Promise.all(Array.from({ length: 8 }, (_, i) => s.mutate("u", (st) => { st.profile.displayName += `${i}`; return { ok: true }; })));
    const final = (await s.get("u"))!;
    expect(final.profile.displayName.length).toBe(8);
    expect(final.version).toBe(8);
    expect(t.casConflicts).toBeGreaterThan(0);
  });

  it("re-runs validation on fresh state: a cap-style guard lets exactly one concurrent writer win", async () => {
    const { s } = await fresh();
    const claim = (st: AppState) => (st.profile.displayName === "" ? ((st.profile.displayName = "claimed"), { ok: true as const }) : { ok: false as const });
    const results = await Promise.all([1, 2, 3, 4].map(() => s.mutate("u", claim)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("does not persist results with ok:false", async () => {
    const { s } = await fresh();
    const r = await s.mutate("u", (st) => { st.profile.displayName = "leak"; return { ok: false as const }; });
    expect(r.ok).toBe(false);
    expect((await s.get("u"))!.profile.displayName).toBe("");
    expect((await s.get("u"))!.version).toBe(0);
  });

  it("writes next_job_at from state.nextJobAt and errors on missing state", async () => {
    const { t, s } = await fresh();
    await s.mutate("u", (st) => { st.nextJobAt = "2026-11-18T00:00:00.000Z"; return { ok: true }; });
    expect(t.rows.get("u")!.nextJobAt).toBe("2026-11-18T00:00:00.000Z");
    await expect(s.mutate("nope", () => 1)).rejects.toThrow(/not found/i);
  });

  it("gives up with a clear error after repeated conflicts", async () => {
    const t = new FakeTable();
    const s = new SupabaseStateStore(t, 2);
    await s.create("u", createInitialState({ mode: "live", timezone: "UTC", now: new Date() }));
    t.compareAndSet = async () => false;
    await expect(s.mutate("u", () => ({ ok: true }))).rejects.toThrow(/concurrent/i);
  });
});
