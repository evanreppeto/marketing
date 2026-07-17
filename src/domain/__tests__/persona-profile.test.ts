import { describe, expect, it } from "vitest";

import { buildPersonaProfile, type PersonaProfileInput } from "@/domain";

const base: PersonaProfileInput = {
  source: "web_form",
  lossSignals: ["water_backup", "burst_pipe"],
  persona: "persona_homeowner_emergency",
  routing: "target",
  leadScore: 60,
  partnerScore: 20,
  matchedTargetKeywords: ["water damage", "emergency repair"],
  matchedNonTargetKeywords: [],
};

const input = (over: Partial<PersonaProfileInput> = {}): PersonaProfileInput => ({ ...base, ...over });

describe("buildPersonaProfile — branch selection", () => {
  it("routes an archived lead to scope review and blocks campaign generation", () => {
    const p = buildPersonaProfile(input({ routing: "archived" }));
    expect(p.relationshipStage).toBe("scope_review");
    expect(p.approvalRequired).toBe(false);
    expect(p.riskFlags).toContain("campaign_generation_blocked");
    expect(p.preferredChannel).toBe("internal_review");
  });

  it("archived wins even for a partner persona", () => {
    // isArchived is checked before isPartner; a partner routed out of scope is
    // still a scope review, not a referral.
    const p = buildPersonaProfile(input({ routing: "archived", persona: "persona_plumbing_partner" }));
    expect(p.actionType).toBe("scope_review");
  });

  it("treats a _partner persona as referral enablement", () => {
    const p = buildPersonaProfile(input({ persona: "persona_plumbing_partner" }));
    expect(p.relationshipStage).toBe("referral_enablement");
    expect(p.actionType).toBe("partner_enablement");
    expect(p.approvalRequired).toBe(true);
  });

  it("treats an _agent persona as referral enablement too", () => {
    // The partner check is persona.includes("_partner") || .includes("_agent").
    expect(buildPersonaProfile(input({ persona: "persona_insurance_agent" })).actionType).toBe("partner_enablement");
  });

  it("routes a restoration lead to emergency follow-up", () => {
    const p = buildPersonaProfile(input());
    expect(p.actionType).toBe("emergency_follow_up");
    expect(p.preferredChannel).toBe("phone_then_sms");
    expect(p.approvalRequired).toBe(true);
  });

  it("marks an elevated restoration lead as an urgent decision", () => {
    expect(buildPersonaProfile(input({ routing: "elevated" })).relationshipStage).toBe("urgent_decision");
    expect(buildPersonaProfile(input({ routing: "needs_review" })).relationshipStage).toBe("needs_review");
  });
});

describe("buildPersonaProfile — derived fields", () => {
  it("confidence is the higher of lead and partner score", () => {
    expect(buildPersonaProfile(input({ leadScore: 40, partnerScore: 80 })).confidenceScore).toBe(80);
    expect(buildPersonaProfile(input({ leadScore: 90, partnerScore: 30 })).confidenceScore).toBe(90);
  });

  it("tiers value at the 70 confidence boundary", () => {
    expect(buildPersonaProfile(input({ leadScore: 69, partnerScore: 0 })).valueTier).toBe("medium");
    expect(buildPersonaProfile(input({ leadScore: 70, partnerScore: 0 })).valueTier).toBe("high");
    // Archived is always low regardless of score.
    expect(buildPersonaProfile(input({ routing: "archived", leadScore: 99 })).valueTier).toBe("low");
  });

  it("takes the dominant loss pattern from the first target keyword", () => {
    expect(buildPersonaProfile(input({ matchedTargetKeywords: ["fire", "smoke"] })).dominantLossPattern).toBe("fire");
  });

  it("falls back to a non-target keyword, then to needs_operator_review", () => {
    expect(
      buildPersonaProfile(input({ matchedTargetKeywords: [], matchedNonTargetKeywords: ["roof"] })).dominantLossPattern,
    ).toBe("roof");
    expect(
      buildPersonaProfile(input({ matchedTargetKeywords: [], matchedNonTargetKeywords: [] })).dominantLossPattern,
    ).toBe("needs_operator_review");
  });

  it("carries the source and loss signals onto the snapshot's source event", () => {
    const p = buildPersonaProfile(input({ source: "storm_canvass", lossSignals: ["hail", "roof_leak"] }));
    expect(p.sourceEvents).toEqual([{ type: "lead_received", source: "storm_canvass", signals: ["hail", "roof_leak"] }]);
  });

  it("every branch requires coverage-neutral language on a generated campaign", () => {
    // The one guardrail that must survive any refactor: restoration and partner
    // profiles both demand coverage-neutral copy (archived generates nothing).
    for (const persona of ["persona_homeowner_emergency", "persona_plumbing_partner"]) {
      expect(buildPersonaProfile(input({ persona })).riskFlags).toContain("coverage_neutral_language_required");
    }
  });
});
