import { afterEach, describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getPerformanceBySlice } from "./slice-read-model";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getPerformanceBySlice", () => {
  it("filters campaign results by org when an org scope is provided", async () => {
    configure();
    const supabase = createSupabaseQueryMock({
      campaign_results: { data: [], error: null },
    });

    await getPerformanceBySlice({ orgId: "org-1" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
  });
});
