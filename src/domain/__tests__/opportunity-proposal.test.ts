import { describe, expect, it } from "vitest";
import { parseOpportunityProposal } from "@/domain";

describe("parseOpportunityProposal", () => {
  it("accepts a valid proposal (snake_case from the tool), folding the kind onto the vocabulary", () => {
    const r = parseOpportunityProposal({
      kind: "reengagement", subject_type: "company", subject_id: "co_1",
      title: "Re-engage Acme", summary: "Quiet 90 days, prior flood job.",
      confidence: 77, urgency: "high", evidence: { lastJob: "2026-03" },
      recommended_action: "Send a check-in", recommended_campaign_type: "email",
    });
    expect(r.ok).toBe(true);
    // "reengagement" is a synonym, not a kind: it normalizes to crm_inactivity so it
    // collides with the existing open card for co_1 instead of re-filing it.
    if (r.ok) expect(r.candidate).toMatchObject({ kind: "crm_inactivity", subjectType: "company", subjectId: "co_1", confidence: 77, urgency: "high", evidence: { lastJob: "2026-03" } });
  });
  it("rejects when required fields are missing", () => {
    const r = parseOpportunityProposal({ kind: "crm_inactivity", subject_type: "company" });
    expect(r.ok).toBe(false);
  });
  it("clamps confidence and defaults urgency", () => {
    const r = parseOpportunityProposal({ kind: "persona_segment_gap", subject_type: "persona", subject_id: "p1", title: "t", summary: "s", confidence: 250 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.candidate.confidence).toBe(100); expect(r.candidate.urgency).toBe("medium"); expect(r.candidate.evidence).toEqual({}); }
  });
});
