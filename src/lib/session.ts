import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createInitialState, clockFor } from "@/lib/domain/state";
import { buildScenario, DEFAULT_SCENARIO, DEMO_TZ } from "@/lib/domain/fixtures";
import type { AppState } from "@/lib/domain/types";
import { MemoryStateStore } from "@/lib/store/memory";
import { StateNotFoundError, type StateStore } from "@/lib/store/types";
import { getEnv, supabaseConfigured, serviceRoleConfigured } from "@/lib/env";

export const DEMO_COOKIE = "interval_demo";
export const DEMO_SCENARIO_COOKIE = "interval_demo_scn";
const DEMO_TTL_SECONDS = 24 * 60 * 60;

export interface Ctx {
  mode: "demo" | "live";
  /** state id: random visitor id (demo) or auth user id (live) */
  id: string;
  store: StateStore;
  user: { id: string; email: string | null } | null;
}

const g = globalThis as unknown as { __intervalDemoMemory?: MemoryStateStore };

/** Demo storage. memory = per-instance (fine locally / single server); supabase = durable across serverless instances. */
export async function demoStore(): Promise<StateStore> {
  if (getEnv().demoStore === "supabase" && serviceRoleConfigured()) {
    const [{ createAdminClient }, { SupabaseStateStore }] = await Promise.all([import("@/lib/supabase/admin"), import("@/lib/store/supabase")]);
    return SupabaseStateStore.forDemo(createAdminClient());
  }
  return (g.__intervalDemoMemory ??= new MemoryStateStore());
}

export function demoCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: DEMO_TTL_SECONDS };
}

async function liveCtx(): Promise<Ctx | null> {
  if (!supabaseConfigured()) return null;
  const { createClient } = await import("@/lib/supabase/server");
  const { SupabaseStateStore } = await import("@/lib/store/supabase");
  const client = await createClient();
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const store = SupabaseStateStore.fromClient(client);
  const existing = await store.get(user.id);
  if (!existing) {
    const name = (user.email ?? "").split("@")[0] ?? "";
    await store.create(user.id, createInitialState({ mode: "live", timezone: DEMO_TZ, displayName: name, now: new Date(), email: user.email ?? null }));
  }
  return { mode: "live", id: user.id, store, user: { id: user.id, email: user.email ?? null } };
}

async function demoCtx(): Promise<Ctx | null> {
  const jar = await cookies();
  const id = jar.get(DEMO_COOKIE)?.value;
  if (!id || !/^[a-f0-9]{32}$/.test(id)) return null;
  const store = await demoStore();
  if (!(await store.get(id))) {
    // Server restarted (or another instance): rebuild this visitor's scenario deterministically.
    const scn = jar.get(DEMO_SCENARIO_COOKIE)?.value ?? DEFAULT_SCENARIO;
    await store.create(id, await buildScenario(scn));
  }
  return { mode: "demo", id, store, user: null };
}

/** Live session wins over a demo cookie. Returns null if neither exists. */
export async function getCtx(): Promise<Ctx | null> {
  return (await liveCtx()) ?? (await demoCtx());
}

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/");
  return ctx;
}

export async function loadState(ctx: Ctx): Promise<{ state: AppState; now: Date }> {
  const state = await ctx.store.get(ctx.id);
  if (!state) throw new StateNotFoundError(ctx.id);
  return { state, now: clockFor(state) };
}

/** Pages: ctx + state + clock, redirecting visitors without a session. */
export async function pageData() {
  const ctx = await requireCtx();
  const { state, now } = await loadState(ctx);
  return { ctx, state, now };
}

export type MutationResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Run a validated mutation for the current visitor/user inside the store's serialized
 * (or compare-and-set) section, then revalidate. Policy checks inside `fn` therefore
 * always run against the freshest state, which is what makes concurrent actions safe.
 */
export async function act<T extends { ok: boolean }>(fn: (state: AppState, now: Date, ctx: Ctx) => T | Promise<T>, opts: { revalidate?: boolean } = {}): Promise<T | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Your session has expired. Start again from the home page." };
  try {
    const result = await ctx.store.mutate(ctx.id, (state) => fn(state, clockFor(state), ctx));
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    return result;
  } catch (e) {
    if (e instanceof StateNotFoundError) return { ok: false, error: "Your session has expired. Start again from the home page." };
    return { ok: false, error: "Something went wrong saving that. Nothing was changed — please try again." };
  }
}
