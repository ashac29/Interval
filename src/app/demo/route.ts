import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { buildScenario, DEFAULT_SCENARIO, SCENARIOS } from "@/lib/domain/fixtures";
import { DEMO_COOKIE, DEMO_SCENARIO_COOKIE, demoCookieOptions, demoStore } from "@/lib/session";

/**
 * Starts (or resumes) an ISOLATED demo session for this visitor. State is keyed by an
 * unguessable random id in an httpOnly cookie; nothing is shared between visitors.
 * `?scenario=<id>` resets the visitor's own demo to that fixture.
 */
export async function GET(request: NextRequest) {
  try {
    return await start(request);
  } catch (e) {
    // Never return an empty body (browsers save it as a 0-byte download). Surface a readable error instead.
    const reason = e instanceof Error ? e.message.slice(0, 120) : "unknown";
    console.error("demo start failed:", reason);
    return NextResponse.redirect(new URL(`/?demo_error=${encodeURIComponent(reason)}`, request.nextUrl.origin));
  }
}

async function start(request: NextRequest) {
  const jar = await cookies();
  const store = await demoStore();
  const requested = request.nextUrl.searchParams.get("scenario");
  const existing = jar.get(DEMO_COOKIE)?.value;
  const valid = existing && /^[a-f0-9]{32}$/.test(existing);
  const dest = new URL(request.nextUrl.searchParams.get("to") === "onboarding" ? "/onboarding" : "/today", request.nextUrl.origin);

  if (valid && !requested && (await store.get(existing))) return NextResponse.redirect(dest);

  const scenario = SCENARIOS.some((s) => s.id === requested) ? (requested as string) : DEFAULT_SCENARIO;
  let id = valid ? existing : "";
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  await store.create(id, await buildScenario(scenario));
  const res = NextResponse.redirect(dest);
  res.cookies.set(DEMO_COOKIE, id, demoCookieOptions());
  res.cookies.set(DEMO_SCENARIO_COOKIE, scenario, demoCookieOptions());
  return res;
}
