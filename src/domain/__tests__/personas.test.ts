import { describe, expect, it } from "vitest";

import {
  INTERNAL_UNASSIGNED_PERSONA,
  OFFICIAL_PERSONA_MAPPINGS,
  isAllowedForLeadIngestion,
  isOfficialPersonaMapping,
  validateLeadIngestionPersona,
} from "../personas";

describe("persona mappings", () => {
  it("contains the 12 official persona tags", () => {
    expect(OFFICIAL_PERSONA_MAPPINGS).toEqual([
      "persona_homeowner_emergency",
      "persona_homeowner_preventative",
      "persona_homeowner_rebuild",
      "persona_landlord",
      "persona_hoa_board",
      "persona_property_manager",
      "persona_insurance_agent",
      "persona_listing_agent",
      "persona_buyers_agent",
      "persona_plumbing_partner",
      "persona_hvac_roof_electrical_partner",
      "persona_gc_remodeler_partner",
    ]);
  });

  it("accepts official personas for lead ingestion", () => {
    expect(isOfficialPersonaMapping("persona_plumbing_partner")).toBe(true);
    expect(isAllowedForLeadIngestion("persona_plumbing_partner")).toBe(true);
    expect(validateLeadIngestionPersona("persona_plumbing_partner")).toEqual({
      ok: true,
      persona: "persona_plumbing_partner",
    });
  });

  it("rejects arbitrary persona strings", () => {
    expect(isOfficialPersonaMapping("random_contractor")).toBe(false);
    expect(validateLeadIngestionPersona("random_contractor")).toEqual({
      ok: false,
      code: "persona_unknown",
      message: "Unknown persona tag: random_contractor",
    });
  });

  it("keeps unassigned_persona internal-only", () => {
    expect(isAllowedForLeadIngestion(INTERNAL_UNASSIGNED_PERSONA)).toBe(false);
    expect(validateLeadIngestionPersona(INTERNAL_UNASSIGNED_PERSONA)).toEqual({
      ok: false,
      code: "persona_internal_only",
      message: "unassigned_persona is internal-only and cannot ingest new leads.",
    });
  });

  it("requires a persona for lead ingestion", () => {
    expect(validateLeadIngestionPersona("")).toEqual({
      ok: false,
      code: "persona_required",
      message: "Lead ingestion requires a verified operational persona tag.",
    });
  });
});
