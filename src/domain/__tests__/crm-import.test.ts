import { describe, expect, it } from "vitest";

import { mapHubspotContactToLead, mapHubspotContacts, resolveHubspotPersona, type HubspotContact } from "../crm-import";
import { parseLeadIngestionPayload } from "../lead-ingestion";
import { OFFICIAL_PERSONA_MAPPINGS } from "../personas";

const PERSONA = OFFICIAL_PERSONA_MAPPINGS[0];
const opts = { defaultPersona: PERSONA, source: "hubspot" };

function contact(properties: Record<string, unknown>, id = "c1"): HubspotContact {
  return { id, properties };
}

describe("mapHubspotContactToLead", () => {
  it("maps a HubSpot contact into a lead the ingestion contract accepts", () => {
    const lead = mapHubspotContactToLead(
      contact({ firstname: "Dana", lastname: "Ng", email: "d@x.co", company: "Acme", city: "Oak Park", state: "IL", zip: "60301" }),
      opts,
    );
    expect(lead).not.toBeNull();
    expect(lead).toMatchObject({
      persona: PERSONA,
      source: "hubspot",
      externalLeadId: "c1",
      company: { name: "Acme" },
      contact: { firstName: "Dana", lastName: "Ng", email: "d@x.co" },
      location: { city: "Oak Park", state: "IL", postalCode: "60301" },
    });
    // Round-trip through the REAL validator — proves the mapping is contract-valid.
    const parsed = parseLeadIngestionPayload(lead);
    expect(parsed.ok).toBe(true);
  });

  it("returns null for a contact with no name/email/phone", () => {
    expect(mapHubspotContactToLead(contact({ company: "Acme" }), opts)).toBeNull();
  });

  it("overrides persona from a mapped property only when it's a valid official persona", () => {
    const other = OFFICIAL_PERSONA_MAPPINGS[1];
    expect(resolveHubspotPersona(contact({ email: "a@b.co", bsr_persona: other }), { ...opts, personaProperty: "bsr_persona" })).toBe(other);
    expect(resolveHubspotPersona(contact({ email: "a@b.co", bsr_persona: "nope" }), { ...opts, personaProperty: "bsr_persona" })).toBe(PERSONA);
  });

  it("mapHubspotContacts drops unusable + id-less rows", () => {
    const out = mapHubspotContacts(
      [contact({ email: "a@b.co" }, "1"), contact({ company: "no contact fields" }, "2"), { id: "", properties: { email: "x@y.co" } }],
      opts,
    );
    expect(out).toHaveLength(1);
    expect(out[0].externalLeadId).toBe("1");
  });
});
