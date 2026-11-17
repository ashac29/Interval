import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "@/lib/supabase/config";

describe("normalizeSupabaseUrl", () => {
  it("strips pasted API paths and slashes", () => {
    const root = "https://abc.supabase.co";
    for (const raw of [root, `${root}/`, `${root}/rest/v1`, `${root}/rest/v1/`, ` ${root}/auth/v1 `]) expect(normalizeSupabaseUrl(raw)).toBe(root);
    expect(normalizeSupabaseUrl("")).toBe("");
  });
});
