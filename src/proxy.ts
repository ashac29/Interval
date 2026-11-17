import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Next 16 "proxy" (formerly middleware): keeps Supabase auth cookies fresh. No-op when Supabase isn't configured. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
