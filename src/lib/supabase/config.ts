/** Supabase env access. Never throws at import time. */
/** Project root only. Tolerates a pasted "/rest/v1" or "/auth/v1" suffix and trailing slashes (the client appends its own paths). */
export const normalizeSupabaseUrl = (raw: string) => raw.trim().replace(/\/+$/, "").replace(/\/(rest|auth|storage|realtime)\/v1$/, "").replace(/\/+$/, "");
export const supabaseUrl = () => normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
export const supabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const serviceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
export function isServiceRoleConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceRoleKey());
}
