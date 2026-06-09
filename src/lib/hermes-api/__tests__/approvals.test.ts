import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { addApprovalRecommendation, listApprovalRecommendations } from "../approvals";

const APPROVAL_ID = "50000000-0000-4000-8000-000000000001";

function insertPayload(supabase: ReturnType<typeof createSupabaseQueryMock>) {
  const call = supabase.calls.find(([method]) => method === "insert");
  return call?.[1] as Record<string, unknown> | undefined;
}

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

  it("redacts secrets in the recommendation before storing", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: { id: APPROVAL_ID }, error: null },
      approval_recommendations: { data: { id: "rec-2" }, error: null },
    });

    await addApprovalRecommendation(
      {
        approvalItemId: APPROVAL_ID,
        recommendation: "Rotate the leaked key sk-ABCDEFGHIJKLMNOP before approving.",
        rationale: "Authorization: Bearer abcDEF123456 was pasted into the draft.",
      },
      supabase,
    );

    const payload = insertPayload(supabase);
    expect(payload?.recommendation).not.toContain("sk-ABCDEFGHIJKLMNOP");
    expect(String(payload?.recommendation)).toContain("[REDACTED]");
    expect(String(payload?.rationale)).not.toContain("abcDEF123456");
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

describe("listApprovalRecommendations", () => {
  it("maps rows newest-first to camelCase", async () => {
    const supabase = createSupabaseQueryMock({
      approval_recommendations: {
        data: [
          {
            id: "rec-1",
            agent: "mark",
            recommendation: "Tighten CTA",
            rationale: null,
            risk_flags: ["copy"],
            suggested_edits: null,
            metadata: {},
            created_at: "2026-06-09T12:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const recs = await listApprovalRecommendations(APPROVAL_ID, supabase);

    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ id: "rec-1", agent: "mark", riskFlags: ["copy"] });
    expect(supabase.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("degrades to [] when the table is missing (pre-migration)", async () => {
    const supabase = createSupabaseQueryMock({
      approval_recommendations: { data: null, error: { message: 'relation "approval_recommendations" does not exist' } },
    });

    await expect(listApprovalRecommendations(APPROVAL_ID, supabase)).resolves.toEqual([]);
  });
});
