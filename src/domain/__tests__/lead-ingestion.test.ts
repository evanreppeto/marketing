import { describe, expect, it } from "vitest";

import { parseLeadIngestionPayload } from "../lead-ingestion";

describe("lead ingestion parsing", () => {
  it("accepts, classifies, and scores a verified water-loss payload", () => {
    expect(
      parseLeadIngestionPayload(
        {
          persona: "persona_homeowner_emergency",
          source: "website",
          contact: {
            firstName: "Marlene",
            phone: "312-555-0148",
          },
          lossSummary: "Basement flooding after burst pipe",
          lossSignals: ["standing water", "burst pipe"],
          metadata: {
            after_hours_call: true,
            photo_uploaded: true,
          },
        },
        "2026-05-27T17:00:00.000Z",
      ),
    ).toMatchObject({
      ok: true,
      status: "accepted",
      routing: "elevated",
      persona: "persona_homeowner_emergency",
      classification: {
        classification: "target_water_loss",
        matchedTargetKeywords: ["flooding", "standing water", "burst pipe"],
      },
      scores: {
        leadScore: 100,
        partnerScore: 0,
        calculatedAt: "2026-05-27T17:00:00.000Z",
      },
    });
  });

  it("accepts a prospecting/partner lead with no loss signals (Arc create_lead shape)", () => {
    // Arc recruits referral partners (plumbers, insurance agents) — these leads
    // have NO loss event, so the tool supplies no lossSignals. The lead must
    // still be accepted and route to needs_review (classification "unknown").
    const result = parseLeadIngestionPayload({
      persona: "persona_plumbing_partner",
      source: "arc_discovery",
      company: { name: "Halsted Plumbing Co", partnerTier: "B" },
      property: {
        streetLine1: "123 N Halsted St",
        city: "Chicago",
        state: "IL",
        postalCode: "60607",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "accepted",
      routing: "needs_review",
      persona: "persona_plumbing_partner",
      classification: { classification: "unknown" },
    });
    // Defaults to the same empty array the DB column defaults to.
    expect(result.ok && result.normalizedInput.lossSignals).toEqual([]);
  });

  it("accepts an explicitly empty lossSignals array", () => {
    expect(
      parseLeadIngestionPayload({
        persona: "persona_plumbing_partner",
        source: "arc_manual",
        company: { name: "Acme Plumbing" },
        lossSignals: [],
      }),
    ).toMatchObject({ ok: true, status: "accepted" });
  });

  it("rejects unassigned_persona for new lead ingestion", () => {
    expect(
      parseLeadIngestionPayload({
        persona: "unassigned_persona",
        source: "website",
        contact: {
          phone: "312-555-0100",
        },
        lossSignals: ["standing water"],
      }),
    ).toMatchObject({
      ok: false,
      status: "rejected",
      httpStatus: 400,
      errors: [
        {
          code: "persona_internal_only",
          path: ["persona"],
        },
      ],
    });
  });

  it("rejects unknown persona strings", () => {
    expect(
      parseLeadIngestionPayload({
        persona: "random_contractor",
        source: "website",
        contact: {
          phone: "312-555-0100",
        },
        lossSignals: ["standing water"],
      }),
    ).toMatchObject({
      ok: false,
      status: "rejected",
      httpStatus: 400,
      errors: [
        {
          code: "persona_unknown",
          path: ["persona"],
        },
      ],
    });
  });

  it("routes hail-only losses to archive", () => {
    expect(
      parseLeadIngestionPayload(
        {
          persona: "persona_homeowner_emergency",
          source: "website",
          contact: {
            firstName: "Carla",
            phone: "312-555-0199",
          },
          lossSummary: "Car hail damage",
          lossSignals: ["hail damage"],
        },
        "2026-05-27T17:00:00.000Z",
      ),
    ).toMatchObject({
      ok: true,
      routing: "archived",
      classification: {
        classification: "non_target_hail_or_wind_only",
      },
    });
  });

  it("captures a partial address (city + state only) as location, mirroring Arc create_lead", () => {
    // Mirrors the object apps/arc-runner/src/tools/crm-write.ts builds when Arc
    // only found a city + state for a prospect: a full `property` can't be formed
    // (no street/zip), so the partial address rides along as `location` instead of
    // being silently dropped.
    const result = parseLeadIngestionPayload({
      persona: "persona_plumbing_partner",
      source: "arc_discovery",
      company: { name: "Halsted Plumbing Co", partnerTier: "B" },
      location: {
        streetLine1: undefined,
        streetLine2: undefined,
        city: "Chicago",
        state: "IL",
        postalCode: undefined,
      },
    });

    expect(result).toMatchObject({ ok: true, status: "accepted" });
    // Undefined optional fields are dropped; the partial address survives.
    expect(result.ok && result.normalizedInput.location).toEqual({
      city: "Chicago",
      state: "IL",
    });
  });

  it("captures a street + city + state location with no postal code (Arc create_lead shape)", () => {
    const result = parseLeadIngestionPayload({
      persona: "persona_plumbing_partner",
      source: "arc_discovery",
      company: { name: "Wicker Park Drain Pros" },
      location: {
        streetLine1: "1842 N Damen Ave",
        streetLine2: undefined,
        city: "Chicago",
        state: "IL",
        postalCode: undefined,
      },
    });

    expect(result).toMatchObject({ ok: true, status: "accepted" });
    expect(result.ok && result.normalizedInput.location).toEqual({
      streetLine1: "1842 N Damen Ave",
      city: "Chicago",
      state: "IL",
    });
  });

  it("degrades an empty location to undefined without rejecting an otherwise valid lead", () => {
    const result = parseLeadIngestionPayload({
      persona: "persona_plumbing_partner",
      source: "arc_discovery",
      company: { name: "Acme Plumbing" },
      location: {},
    });

    expect(result).toMatchObject({ ok: true, status: "accepted" });
    expect(result.ok && result.normalizedInput.location).toBeUndefined();
  });

  it("rejects leads without a company, contact, or property relationship", () => {
    expect(
      parseLeadIngestionPayload({
        persona: "persona_homeowner_emergency",
        source: "website",
        lossSignals: ["standing water"],
      }),
    ).toMatchObject({
      ok: false,
      status: "rejected",
      httpStatus: 400,
      errors: [
        {
          code: "custom",
          path: ["relationship"],
        },
      ],
    });
  });
});

describe("parseLeadIngestionPayload with an org persona set", () => {
  const basePayload = {
    persona: "persona_wedding_lead",
    source: "website",
    lossSignals: ["ceremony tent flooded"],
    contact: { firstName: "Dana", email: "dana@example.com" },
  };

  it("accepts a persona that is in the provided org set", () => {
    const result = parseLeadIngestionPayload(basePayload, undefined, [
      "persona_wedding_lead",
      "persona_corporate_event",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.persona).toBe("persona_wedding_lead");
  });

  it("rejects a persona that is not in the provided org set", () => {
    const result = parseLeadIngestionPayload(basePayload, undefined, ["persona_corporate_event"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(400);
      expect(result.errors[0]).toMatchObject({ code: "persona_unknown", path: ["persona"] });
    }
  });
});

describe("lead ingestion attribution", () => {
  const base = {
    persona: "persona_homeowner_emergency",
    source: "website_form",
    lossSignals: ["standing water"],
    contact: { email: "a@b.com" },
  };

  it("resolves an explicit campaign attribution block onto the accepted result", () => {
    const result = parseLeadIngestionPayload({
      ...base,
      attribution: { campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attribution).toMatchObject({ campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad", method: "explicit" });
    }
  });

  it("degrades a malformed attribution block to unattributed without rejecting the lead", () => {
    const result = parseLeadIngestionPayload({ ...base, attribution: { campaignId: 12345 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attribution.method).toBe("unattributed");
  });

  it("defaults to unattributed when no attribution block is present", () => {
    const result = parseLeadIngestionPayload(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attribution.method).toBe("unattributed");
  });
});
