import { describe, expect, it } from "vitest";

import { checkArcGeneratedCopy } from "./guardrails";

describe("checkArcGeneratedCopy", () => {
  it("always applies the universal baseline (human review + outbound locked)", () => {
    const result = checkArcGeneratedCopy({ draftOutput: "Hello from Acme Co. Want to chat?" });
    expect(result.riskLevel).toBe("low");
    expect(result.approvalStatus).toBe("pending_owner_approval");
    expect(result.blockedPhrases).toEqual([]);
    expect(result.flags).toContain("Human review required");
    expect(result.flags).toContain("Outbound locked until approved");
  });

  it("blocks copy that contains one of the org's banned phrases (case-insensitive)", () => {
    const result = checkArcGeneratedCopy({
      draftOutput: "We guarantee your INSURANCE WILL COVER the claim.",
      bannedPhrases: ["insurance will cover", "we guarantee"],
      complianceNotes: "Coverage-neutral language required.",
    });
    expect(result.riskLevel).toBe("blocked");
    expect(result.approvalStatus).toBe("needs_compliance");
    expect(result.blockedPhrases).toContain("insurance will cover");
    expect(result.blockedPhrases).toContain("we guarantee");
    expect(result.complianceNotes).toBe("Coverage-neutral language required.");
  });

  it("ignores empty/whitespace banned phrases and passes clean copy", () => {
    const result = checkArcGeneratedCopy({
      draftOutput: "A friendly note from Acme.",
      bannedPhrases: ["", "   "],
    });
    expect(result.riskLevel).toBe("low");
    expect(result.blockedPhrases).toEqual([]);
    expect(result.flags).toContain("No banned phrase detected");
  });
});
