import { describe, expect, it } from "vitest";

import { LeadSchema } from "../leads";

describe("LeadSchema", () => {
  it("parses a stored lead row into a camelCase domain Lead", () => {
    const row = {
      id: "10000000-0000-4000-8000-000000000001",
      company_id: "10000000-0000-4000-8000-000000000002",
      contact_id: "10000000-0000-4000-8000-000000000003",
      property_id: "10000000-0000-4000-8000-000000000004",
      persona: "persona_homeowner_emergency",
      status: "validated",
      routing_recommendation: "elevated",
      source: "website",
      external_lead_id: null,
      loss_summary: "Basement flooding",
      loss_signals: ["standing water", "burst pipe"],
      matched_target_keywords: ["standing water"],
      matched_non_target_keywords: [],
      lead_score: 85,
      received_at: "2026-05-28T09:00:00.000Z",
      metadata: { partner_score: 60 },
      created_at: "2026-05-28T09:00:00.000Z",
      updated_at: "2026-05-28T09:00:00.000Z",
    };

    expect(LeadSchema.parse(row)).toEqual({
      id: "10000000-0000-4000-8000-000000000001",
      companyId: "10000000-0000-4000-8000-000000000002",
      contactId: "10000000-0000-4000-8000-000000000003",
      propertyId: "10000000-0000-4000-8000-000000000004",
      persona: "persona_homeowner_emergency",
      status: "validated",
      routingRecommendation: "elevated",
      source: "website",
      externalLeadId: null,
      lossSummary: "Basement flooding",
      lossSignals: ["standing water", "burst pipe"],
      matchedTargetKeywords: ["standing water"],
      matchedNonTargetKeywords: [],
      leadScore: 85,
      receivedAt: "2026-05-28T09:00:00.000Z",
      metadata: { partner_score: 60 },
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T09:00:00.000Z",
    });
  });

  it("rejects lead_score above 100", () => {
    expect(() =>
      LeadSchema.parse({
        id: "10000000-0000-4000-8000-000000000001",
        company_id: null,
        contact_id: null,
        property_id: null,
        persona: "persona_homeowner_emergency",
        status: "validated",
        routing_recommendation: "target",
        source: "website",
        external_lead_id: null,
        loss_summary: null,
        loss_signals: [],
        matched_target_keywords: [],
        matched_non_target_keywords: [],
        lead_score: 150,
        received_at: "2026-05-28T09:00:00.000Z",
        metadata: {},
        created_at: "2026-05-28T09:00:00.000Z",
        updated_at: "2026-05-28T09:00:00.000Z",
      }),
    ).toThrow();
  });
});
