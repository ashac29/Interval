/** Supabase env access. Never throws at import time. */
export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const serviceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
export function isServiceRoleConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceRoleKey());
}
