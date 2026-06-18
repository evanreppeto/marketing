import { describe, expect, it } from "vitest";

import { deriveSourceType, normalizeApprovalStatus } from "./gallery";

describe("normalizeApprovalStatus", () => {
  it("maps the approval_status enum to the four UI buckets", () => {
    expect(normalizeApprovalStatus("approved")).toBe("approved");
    expect(normalizeApprovalStatus("pending_approval")).toBe("pending");
    expect(normalizeApprovalStatus("pending_owner_approval")).toBe("pending");
    expect(normalizeApprovalStatus("needs_compliance")).toBe("pending");
    expect(normalizeApprovalStatus("declined")).toBe("rejected");
    expect(normalizeApprovalStatus("rejected")).toBe("rejected");
    expect(normalizeApprovalStatus("blocked")).toBe("rejected");
    expect(normalizeApprovalStatus("draft")).toBe("draft");
    expect(normalizeApprovalStatus("needs_revision")).toBe("draft");
    expect(normalizeApprovalStatus("archived")).toBe("draft");
    expect(normalizeApprovalStatus("something_unknown")).toBe("draft");
  });
});

describe("deriveSourceType", () => {
  it("flags prompt-driven asset types as AI-generated", () => {
    expect(deriveSourceType("image_prompt", null)).toBe("ai");
    expect(deriveSourceType("video_prompt", null)).toBe("ai");
  });

  it("flags generator tools as AI-generated", () => {
    expect(deriveSourceType("social_ad", "Higgsfield")).toBe("ai");
    expect(deriveSourceType("social_ad", "DALL-E pipeline")).toBe("ai");
  });

  it("treats everything else as real BSR media", () => {
    expect(deriveSourceType("social_ad", "Arc Orchestrator")).toBe("real");
    expect(deriveSourceType("one_pager", null)).toBe("real");
  });
});
