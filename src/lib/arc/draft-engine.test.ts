import { describe, expect, it } from "vitest";

import { type ArcBusinessContext, EMPTY_BRAND_PALETTE } from "@/domain";

import { parseArcPartnerCampaignRequest } from "./contracts";
import { createPartnerCampaignDraft } from "./draft-engine";

const CONTEXT: ArcBusinessContext = {
  businessName: "Acme Restoration",
  industry: "home_property_services",
  services: ["Water mitigation"],
  tone: "professional",
  voiceGuidance: null,
  preferredPhrases: [],
  bannedPhrases: [],
  proofPoints: [],
  personas: [],
  guardrails: { disallowedClaims: [], complianceNotes: "" },
  brainFacts: ["Proof: IICRC certified.", "Voice: calm and specific."],
  palette: EMPTY_BRAND_PALETTE,
  logoUrl: null,
  tagline: null,
  description: null,
  websiteUrl: null,
  serviceAreas: [],
};

describe("createPartnerCampaignDraft", () => {
  it("carries approved Brain facts into prompt inputs and reasoning", () => {
    const draft = createPartnerCampaignDraft(parseArcPartnerCampaignRequest({}), CONTEXT);

    expect(draft.promptInput).toContain("Approved Brain facts:");
    expect(draft.promptInputs.approved_brain_facts).toEqual(CONTEXT.brainFacts);
    expect(draft.reasoningPayload.source_data).toMatchObject({
      approved_brain_facts: CONTEXT.brainFacts,
    });
  });
});
