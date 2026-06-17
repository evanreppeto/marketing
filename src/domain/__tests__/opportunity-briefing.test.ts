import { describe, expect, it } from "vitest";
import { buildOpportunityBriefing, type OpportunityBriefingInput } from "../opportunity-briefing";

const input: OpportunityBriefingInput = {
  title: "Dana K. — quiet 47 days",
  summary: "Open lead (score 70) with no live campaign, no activity in 47 days.",
  urgency: "high",
  confidence: 77,
  recommendedAction: "Re-engage with a persona-tailored campaign",
  persona: "persona_homeowner_emergency",
  leadHref: "/crm/leads/lead-1",
};

describe("buildOpportunityBriefing", () => {
  it("produces a draft-mode instruction mentioning the persona, evidence, and a package ask", () => {
    const out = buildOpportunityBriefing(input);
    expect(out).toContain("persona_homeowner_emergency");
    expect(out).toContain("47 days");
    expect(out).toMatch(/draft/i);
    expect(out).toMatch(/approval/i);
  });
});
