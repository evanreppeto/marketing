import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { listOutcomes } from "./outcomes";

describe("listOutcomes", () => {
  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({ outcomes: { data: [], error: null } });

    await listOutcomes({ orgId: "org-1" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
  });

  it("can exclude synthetic seed fixtures before counting or returning rows", async () => {
    const supabase = createSupabaseQueryMock({ outcomes: { data: [], error: null } });

    await listOutcomes({ excludeSynthetic: true }, supabase);

    expect(supabase.calls).toContainEqual(["is", "metadata->>seed_batch", null]);
  });
});
