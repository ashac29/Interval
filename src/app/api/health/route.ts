import { NextResponse } from "next/server";
import { capabilities } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Reports which integrations are configured (booleans only, never values). The demo works regardless. */
export async function GET() {
  return NextResponse.json({ ok: true, app: "interval", demo: true, capabilities: capabilities() });
}
