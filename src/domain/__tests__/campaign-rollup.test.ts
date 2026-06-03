import { describe, expect, it } from "vitest";

import { bucketCampaignStatus, deriveCampaignRollup } from "../campaign-rollup";

describe("bucketCampaignStatus", () => {
  it("maps raw statuses to buckets (case-insensitive)", () => {
    expect(bucketCampaignStatus("approved")).toBe("approved");
    expect(bucketCampaignStatus("Pending_Approval")).toBe("pending");
    expect(bucketCampaignStatus("pending_owner_approval")).toBe("pending");
    expect(bucketCampaignStatus("needs_compliance")).toBe("pending");
    expect(bucketCampaignStatus("revision_requested")).toBe("changes");
    expect(bucketCampaignStatus("declined")).toBe("changes");
    expect(bucketCampaignStatus("archived")).toBe("archived");
    expect(bucketCampaignStatus("draft")).toBe("draft");
    expect(bucketCampaignStatus("something_unknown")).toBe("draft");
  });
});

describe("deriveCampaignRollup", () => {
  it("prioritizes needs_review when any piece is pending", () => {
    const r = deriveCampaignRollup(["approved", "pending_approval", "draft"]);
    expect(r.state).toBe("needs_review");
    expect(r.label).toBe("Needs your review · 1 pending");
    expect(r).toMatchObject({ approved: 1, pending: 1, changes: 0, draft: 1, total: 3 });
  });

  it("is ready when every non-archived piece is approved", () => {
    const r = deriveCampaignRollup(["approved", "approved", "archived"]);
    expect(r.state).toBe("ready");
    expect(r.label).toBe("Ready to launch");
    expect(r.total).toBe(2); // archived excluded from denominator
  });

  it("is in_progress with a mix of approved and draft, none pending", () => {
    const r = deriveCampaignRollup(["approved", "draft", "draft"]);
    expect(r.state).toBe("in_progress");
    expect(r.label).toBe("In progress · 1 of 3 approved");
  });

  it("is changes_requested when only changes remain", () => {
    const r = deriveCampaignRollup(["revision_requested", "declined"]);
    expect(r.state).toBe("changes_requested");
    expect(r.label).toBe("Changes requested · 2");
  });

  it("is drafting when everything is draft", () => {
    const r = deriveCampaignRollup(["draft", "draft"]);
    expect(r.state).toBe("drafting");
  });

  it("is empty with no pieces (or only archived)", () => {
    expect(deriveCampaignRollup([]).state).toBe("empty");
    expect(deriveCampaignRollup(["archived"]).state).toBe("empty");
    expect(deriveCampaignRollup([]).label).toBe("No deliverables yet");
  });
});
