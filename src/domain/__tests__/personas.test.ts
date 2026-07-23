import { describe, expect, it } from "vitest";

import {
  INTERNAL_UNASSIGNED_PERSONA,
  OFFICIAL_PERSONA_MAPPINGS,
  humanizePersonaLabel,
  isAllowedForLeadIngestion,
  isAllowedPersona,
  isOfficialPersonaMapping,
  validateLeadIngestionPersona,
} from "../personas";

describe("humanizePersonaLabel", () => {
  it("sentence-cases a persona key", () => {
    expect(humanizePersonaLabel("persona_property_manager")).toBe("Property manager");
    expect(humanizePersonaLabel("persona_homeowner_emergency")).toBe("Homeowner emergency");
  });

  it("keeps acronyms uppercase instead of 'Hoa board' / 'Hvac …' / 'Gc …'", () => {
    expect(humanizePersonaLabel("persona_hoa_board")).toBe("HOA board");
    expect(humanizePersonaLabel("persona_hvac_roof_electrical_partner")).toBe("HVAC roof electrical partner");
    expect(humanizePersonaLabel("persona_gc_remodeler_partner")).toBe("GC remodeler partner");
  });

  it("handles slugs without the persona prefix, hyphens, and empty input", () => {
    expect(humanizePersonaLabel("hoa-board")).toBe("HOA board");
    expect(humanizePersonaLabel("wedding_lead")).toBe("Wedding lead");
    expect(humanizePersonaLabel(INTERNAL_UNASSIGNED_PERSONA)).toBe("Unassigned persona");
    expect(humanizePersonaLabel("")).toBe("");
  });
});

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

describe("injected allowed persona sets", () => {
  const orgKeys = ["persona_wedding_lead", "persona_corporate_event"] as const;

  it("accepts a persona in the org's set", () => {
    expect(validateLeadIngestionPersona("persona_wedding_lead", orgKeys)).toEqual({
      ok: true,
      persona: "persona_wedding_lead",
    });
    expect(isAllowedPersona("persona_wedding_lead", orgKeys)).toBe(true);
  });

  it("rejects a persona not in the org's set, even an official BSR one", () => {
    expect(validateLeadIngestionPersona("persona_plumbing_partner", orgKeys)).toEqual({
      ok: false,
      code: "persona_unknown",
      message: "Unknown persona tag: persona_plumbing_partner",
    });
    expect(isAllowedPersona("persona_plumbing_partner", orgKeys)).toBe(false);
  });

  it("still rejects the internal unassigned sentinel regardless of set", () => {
    expect(validateLeadIngestionPersona("unassigned_persona", orgKeys)).toEqual({
      ok: false,
      code: "persona_internal_only",
      message: "unassigned_persona is internal-only and cannot ingest new leads.",
    });
  });

  it("falls back to the BSR default set when allowedKeys is omitted", () => {
    expect(validateLeadIngestionPersona("persona_plumbing_partner")).toEqual({
      ok: true,
      persona: "persona_plumbing_partner",
    });
  });
});
