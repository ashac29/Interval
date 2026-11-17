import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";

/** Browser client (anon key only). */
export function createBrowser() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
