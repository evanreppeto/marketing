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
