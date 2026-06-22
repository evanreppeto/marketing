import { afterEach, describe, expect, it, vi } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";

import { listPersonas } from "./console";

/** Minimal stub: from(table).select().eq().order() -> { data, error } */
function fakeClient(perTable: Record<string, { data: unknown; error: { message: string } | null }>): SupabaseClient {
  return {
    from(table: string) {
      const source = perTable[table] ?? { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve({ data: source.data ?? null, error: source.error ?? null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

vi.mock("@/lib/auth/org", () => ({
  getCurrentOrgId: () => Promise.resolve("org-1"),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () =>
    fakeClient({
      personas: { data: [], error: null },
    }),
}));

describe("listPersonas — demo gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns empty array (not demo) when flag is OFF and DB is empty", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "0");
    const result = await listPersonas();
    expect(result).toEqual([]);
  });

  it("returns demo personas when flag is ON and DB is empty", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    const result = await listPersonas();
    expect(result.length).toBeGreaterThan(0);
    // Demo personas have real slugs
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");
  });
});
