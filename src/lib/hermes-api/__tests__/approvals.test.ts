import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { addApprovalRecommendation } from "../approvals";

const APPROVAL_ID = "50000000-0000-4000-8000-000000000001";

describe("addApprovalRecommendation (safety)", () => {
  it("inserts ONLY into approval_recommendations and never touches the decision path", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: { id: APPROVAL_ID }, error: null },
      approval_recommendations: { data: { id: "rec-1" }, error: null },
    });

    const result = await addApprovalRecommendation(
      {
        approvalItemId: APPROVAL_ID,
        recommendation: "Tighten the CTA before approving.",
        rationale: "Compliance prefers explicit opt-out language.",
        riskFlags: ["copy_review"],
      },
      supabase,
    );

    expect(result).toMatchObject({ ok: true, recommendationId: "rec-1" });

    // The recommendation is written to its own ledger...
    expect(supabase.calls).toContainEqual(["from", "approval_recommendations"]);
    // ...and the human decision surfaces are NEVER written.
    expect(supabase.calls).not.toContainEqual(["from", "approval_decisions"]);
    // No status mutation anywhere: a recommendation never updates a row.
    expect(supabase.calls.filter(([m]) => m === "update")).toHaveLength(0);
    // Exactly one insert, and it is the recommendation.
    expect(supabase.calls.filter(([m]) => m === "insert")).toHaveLength(1);
  });

  it("returns not_found when the approval item does not exist", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: null, error: null },
    });

    const result = await addApprovalRecommendation(
      { approvalItemId: "missing", recommendation: "hi" },
      supabase,
    );

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
    expect(supabase.calls.filter(([m]) => m === "insert")).toHaveLength(0);
  });
});
