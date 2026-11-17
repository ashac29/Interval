import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "./config";

/** Service-role client. Server only: bypasses RLS. */
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("Service-role client must never run in the browser.");
  if (!supabaseUrl() || !serviceRoleKey()) throw new Error("Supabase service role is not configured.");
  return createClient(supabaseUrl(), serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
