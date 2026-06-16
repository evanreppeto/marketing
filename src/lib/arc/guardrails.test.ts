import { describe, expect, it } from "vitest";

import { checkArcGeneratedCopy } from "./guardrails";

describe("checkArcGeneratedCopy", () => {
  it("allows coverage-neutral partner outreach with owner approval", () => {
    const result = checkArcGeneratedCopy({
      draftOutput:
        "Big Shoulders Restoration can help with mitigation, documentation, and rebuild coordination after your team stops the source.",
      lossSignals: ["water_backup"],
      restorationFocus: "water_backup",
    });

    expect(result).toMatchObject({
      riskLevel: "low",
      approvalStatus: "pending_owner_approval",
      blockedPhrases: [],
    });
    expect(result.flags).toContain("Human review required");
    expect(result.flags).toContain("No coverage promise detected");
  });

  it("blocks insurance and claim outcome promises", () => {
    const result = checkArcGeneratedCopy({
      draftOutput: "We guarantee your insurance will cover the claim and the claim will be approved.",
      lossSignals: ["water_backup"],
      restorationFocus: "water_backup",
    });

    expect(result.riskLevel).toBe("blocked");
    expect(result.approvalStatus).toBe("needs_compliance");
    expect(result.blockedPhrases).toContain("Insurance outcome promise");
    expect(result.blockedPhrases).toContain("Claim approval promise");
  });

  it("blocks off-scope exterior-only loss requests", () => {
    const result = checkArcGeneratedCopy({
      draftOutput: "Create partner outreach for exterior roof work.",
      lossSignals: ["hail-only", "roof-only"],
      restorationFocus: "water_backup",
    });

    expect(result.riskLevel).toBe("blocked");
    expect(result.flags).toContain("Off-scope exterior-only loss blocked");
  });
});
