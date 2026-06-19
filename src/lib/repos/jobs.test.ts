import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { listJobs } from "./jobs";

describe("listJobs", () => {
  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({ jobs: { data: [], error: null } });

    await listJobs({ orgId: "org-1" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
  });
});
