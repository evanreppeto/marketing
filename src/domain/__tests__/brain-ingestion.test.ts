import { describe, expect, it } from "vitest";
import {
  buildEdgesForCampaign,
  buildEdgesForCampaignResult,
  buildEdgesForCrmRow,
  buildNodeInputForCampaign,
  buildNodeInputForCampaignResult,
  buildNodeInputForCrmRow,
  buildNodeInputForMedia,
  buildPersonaNodeInput,
  campaignNodeKey,
  campaignResultNodeKey,
  crmChildRefs,
  crmNodeKey,
  embedHash,
  mediaNodeKey,
  personaDisplayLabel,
  CRM_NODE_KINDS,
} from "../brain-ingestion";

describe("crmNodeKey / CRM_NODE_KINDS", () => {
  it("builds a stable per-record key and prefixed kind", () => {
    expect(crmNodeKey("companies", "abc")).toBe("crm:companies:abc");
    expect(CRM_NODE_KINDS.companies).toBe("crm_company");
    expect(CRM_NODE_KINDS.outcomes).toBe("crm_outcome");
  });
});

describe("embedHash", () => {
  it("is stable for the same text and differs when text changes", () => {
    expect(embedHash("a\nb")).toBe(embedHash("a\nb"));
    expect(embedHash("a\nb")).not.toBe(embedHash("a\nc"));
  });
});

describe("buildNodeInputForCrmRow — companies", () => {
  it("maps a company row to a node input with summary, key, ref, persona", () => {
    const input = buildNodeInputForCrmRow("companies", {
      id: "c1", name: "Acme Property Group", persona: "property_manager",
      status: "active", partner_tier: "gold", website_url: "https://acme.test",
      phone: "555-1000", email: "ops@acme.test",
    });
    expect(input.kind).toBe("crm_company");
    expect(input.key).toBe("crm:companies:c1");
    expect(input.label).toBe("Acme Property Group");
    expect(input.refTable).toBe("companies");
    expect(input.refId).toBe("c1");
    expect(input.persona).toBe("property_manager");
    expect(input.summary).toContain("Acme Property Group");
    expect(input.summary).toContain("gold");
    expect(input.tags).toContain("crm");
  });

  it("drops unassigned_persona to null (ingest rejects it)", () => {
    const input = buildNodeInputForCrmRow("companies", { id: "c2", name: "NoPersona Co", persona: "unassigned_persona" });
    expect(input.persona).toBeNull();
  });
});

describe("buildNodeInputForCrmRow — contacts/properties/leads", () => {
  it("labels a contact by full_name, falling back to email", () => {
    expect(buildNodeInputForCrmRow("contacts", { id: "k1", full_name: "Dana Reyes" }).label).toBe("Dana Reyes");
    expect(buildNodeInputForCrmRow("contacts", { id: "k2", full_name: null, email: "dana@x.test" }).label).toBe("dana@x.test");
  });
  it("labels a property by address", () => {
    expect(buildNodeInputForCrmRow("properties", {
      id: "p1", street_line_1: "12 Oak St", city: "Oak Park", state: "IL", postal_code: "60301",
    }).label).toBe("12 Oak St, Oak Park, IL");
  });
  it("includes lead score and source in the lead summary", () => {
    const input = buildNodeInputForCrmRow("leads", { id: "l1", source: "website", lead_score: 87, loss_summary: "flood damage" });
    expect(input.kind).toBe("crm_lead");
    expect(input.summary).toContain("website");
    expect(input.summary).toContain("87");
    expect(input.summary).toContain("flood damage");
  });
});

describe("buildNodeInputForCrmRow — jobs/outcomes", () => {
  it("formats estimated revenue as dollars and labels a job by id when no job_number", () => {
    const input = buildNodeInputForCrmRow("jobs", { id: "0123456789ab", status: "scheduled", estimated_revenue_cents: 250000 });
    expect(input.kind).toBe("crm_job");
    expect(input.label).toBe("Job 01234567");
    expect(input.summary).toContain("$2,500");
  });
  it("labels a job by job_number when present", () => {
    expect(buildNodeInputForCrmRow("jobs", { id: "x", job_number: "JOB-9" }).label).toBe("Job JOB-9");
  });
});

describe("buildEdgesForCrmRow", () => {
  it("links a lead to its company/contact/property via belongs_to and to its persona via targets", () => {
    const edges = buildEdgesForCrmRow("leads", {
      id: "l1", company_id: "co1", contact_id: "k1", property_id: "p1", persona: "persona_landlord",
    });
    // 3 belongs_to + 1 targets
    expect(edges).toHaveLength(4);
    expect(edges).toContainEqual({
      fromKind: "crm_lead", fromKey: "crm:leads:l1",
      toKind: "crm_company", toKey: "crm:companies:co1", relation: "belongs_to",
    });
    expect(edges).toContainEqual({
      fromKind: "crm_lead", fromKey: "crm:leads:l1",
      toKind: "crm_contact", toKey: "crm:contacts:k1", relation: "belongs_to",
    });
    expect(edges).toContainEqual({
      fromKind: "crm_lead", fromKey: "crm:leads:l1",
      toKind: "crm_property", toKey: "crm:properties:p1", relation: "belongs_to",
    });
    expect(edges).toContainEqual({
      fromKind: "crm_lead", fromKey: "crm:leads:l1",
      toKind: "persona", toKey: "persona_landlord", relation: "targets",
    });
  });

  it("skips null/missing foreign keys", () => {
    const edges = buildEdgesForCrmRow("leads", { id: "l2", company_id: "co1", contact_id: null });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ toKey: "crm:companies:co1", relation: "belongs_to" });
  });

  it("emits no targets edge for unassigned/absent persona", () => {
    expect(buildEdgesForCrmRow("companies", { id: "co1", persona: "unassigned_persona" })).toHaveLength(0);
    expect(buildEdgesForCrmRow("companies", { id: "co2" })).toHaveLength(0);
  });

  it("links a contact to its company", () => {
    const edges = buildEdgesForCrmRow("contacts", { id: "k1", company_id: "co1" });
    expect(edges).toEqual([
      { fromKind: "crm_contact", fromKey: "crm:contacts:k1", toKind: "crm_company", toKey: "crm:companies:co1", relation: "belongs_to" },
    ]);
  });

  it("links an outcome to its lead and job", () => {
    const edges = buildEdgesForCrmRow("outcomes", { id: "o1", lead_id: "l1", job_id: "j1" });
    expect(edges.map((e) => e.toKey)).toEqual(["crm:leads:l1", "crm:jobs:j1"]);
    expect(edges.every((e) => e.relation === "belongs_to")).toBe(true);
  });

  it("returns nothing for a row without an id", () => {
    expect(buildEdgesForCrmRow("leads", { company_id: "co1" })).toEqual([]);
  });
});

describe("buildNodeInputForCampaign", () => {
  it("maps a campaign row to a campaign_ref node with persona + summary", () => {
    const input = buildNodeInputForCampaign({
      id: "cmp1", name: "Fall Water Push", persona: "persona_landlord", restoration_focus: "water",
      status: "draft", objective: "book inspections", audience_summary: "flood-prone landlords",
    });
    expect(input.kind).toBe("campaign_ref");
    expect(input.key).toBe("campaign:cmp1");
    expect(input.label).toBe("Fall Water Push");
    expect(input.refTable).toBe("campaigns");
    expect(input.refId).toBe("cmp1");
    expect(input.persona).toBe("persona_landlord");
    expect(input.summary).toContain("Fall Water Push");
    expect(input.summary).toContain("flood-prone landlords");
    expect(input.tags).toContain("campaign");
  });
});

describe("buildEdgesForCampaign", () => {
  it("targets the persona and relates_to each CRM record it's aimed at", () => {
    const edges = buildEdgesForCampaign({
      id: "cmp1", persona: "persona_landlord", company_id: "co1", lead_id: "l1", contact_id: null, property_id: null,
    });
    expect(edges).toContainEqual({
      fromKind: "campaign_ref", fromKey: "campaign:cmp1", toKind: "persona", toKey: "persona_landlord", relation: "targets",
    });
    expect(edges).toContainEqual({
      fromKind: "campaign_ref", fromKey: "campaign:cmp1", toKind: "crm_company", toKey: "crm:companies:co1", relation: "relates_to",
    });
    expect(edges).toContainEqual({
      fromKind: "campaign_ref", fromKey: "campaign:cmp1", toKind: "crm_lead", toKey: "crm:leads:l1", relation: "relates_to",
    });
    // null FKs (contact/property) produce no edges
    expect(edges).toHaveLength(3);
  });

  it("emits just the persona edge when no CRM refs are set", () => {
    const edges = buildEdgesForCampaign({ id: "cmp2", persona: "persona_hoa_board" });
    expect(edges).toEqual([
      { fromKind: "campaign_ref", fromKey: "campaign:cmp2", toKind: "persona", toKey: "persona_hoa_board", relation: "targets" },
    ]);
  });

  it("returns nothing for a row without an id", () => {
    expect(buildEdgesForCampaign({ persona: "persona_landlord" })).toEqual([]);
  });
});

describe("campaignNodeKey", () => {
  it("builds a stable per-campaign key", () => {
    expect(campaignNodeKey("abc")).toBe("campaign:abc");
  });
});

describe("buildNodeInputForMedia", () => {
  it("maps a media_assets row to an asset_ref node with kind/source/tags", () => {
    const input = buildNodeInputForMedia({
      id: "m1", file_name: "before-after.jpg", kind: "image", source: "uploaded",
      content_type: "image/jpeg", tags: ["water", "proof"],
    });
    expect(input.kind).toBe("asset_ref");
    expect(input.key).toBe("media:m1");
    expect(input.label).toBe("before-after.jpg");
    expect(input.refTable).toBe("media_assets");
    expect(input.refId).toBe("m1");
    expect(input.summary).toContain("image");
    expect(input.summary).toContain("water, proof");
    expect(input.tags).toEqual(expect.arrayContaining(["media", "image", "water", "proof"]));
  });
});

describe("mediaNodeKey", () => {
  it("builds a stable per-asset key", () => {
    expect(mediaNodeKey("xyz")).toBe("media:xyz");
  });
});

describe("buildNodeInputForCampaignResult", () => {
  it("maps a campaign_results row to a signal node referencing its campaign", () => {
    const input = buildNodeInputForCampaignResult({
      id: "r1", campaign_id: "cmp1", channel: "meta", period_start: "2026-06-01", period_end: "2026-06-30",
      impressions: 12000, clicks: 340, leads: 18, jobs: 4, won_revenue_cents: 1850000, spend_cents: 60000,
    });
    expect(input.kind).toBe("signal");
    expect(input.key).toBe("perf:r1");
    expect(input.refTable).toBe("campaigns");
    expect(input.refId).toBe("cmp1");
    expect(input.label).toContain("2026-06-01");
    expect(input.summary).toContain("meta");
    expect(input.summary).toContain("18"); // leads
    expect(input.summary).toContain("$18,500"); // won revenue from cents
    expect(input.tags).toContain("performance");
  });
});

describe("buildEdgesForCampaignResult", () => {
  it("links the performance signal learned_from its campaign", () => {
    expect(buildEdgesForCampaignResult({ id: "r1", campaign_id: "cmp1" })).toEqual([
      { fromKind: "signal", fromKey: "perf:r1", toKind: "campaign_ref", toKey: "campaign:cmp1", relation: "learned_from" },
    ]);
  });

  it("returns nothing without an id or campaign_id", () => {
    expect(buildEdgesForCampaignResult({ id: "r1" })).toEqual([]);
    expect(buildEdgesForCampaignResult({ campaign_id: "cmp1" })).toEqual([]);
  });
});

describe("campaignResultNodeKey", () => {
  it("builds a stable per-result key", () => {
    expect(campaignResultNodeKey("r9")).toBe("perf:r9");
  });
});

describe("personaDisplayLabel", () => {
  it("humanizes a persona slug into a readable label", () => {
    expect(personaDisplayLabel("persona_landlord")).toBe("Landlord");
    expect(personaDisplayLabel("persona_homeowner_emergency")).toBe("Homeowner Emergency");
  });

  it("uppercases known acronyms", () => {
    expect(personaDisplayLabel("persona_hoa_board")).toBe("HOA Board");
    expect(personaDisplayLabel("persona_hvac_roof_electrical_partner")).toBe("HVAC Roof Electrical Partner");
    expect(personaDisplayLabel("persona_gc_remodeler_partner")).toBe("GC Remodeler Partner");
  });

  it("works for org-custom slugs without the persona_ prefix", () => {
    expect(personaDisplayLabel("vip_referral_partner")).toBe("Vip Referral Partner");
  });
});

describe("buildPersonaNodeInput", () => {
  it("builds a persona node keyed by the persona value so edges can resolve it", () => {
    const input = buildPersonaNodeInput("persona_landlord");
    expect(input.kind).toBe("persona");
    expect(input.key).toBe("persona_landlord");
    expect(input.persona).toBe("persona_landlord");
    expect(input.label).toBe("Landlord");
    expect(input.tags).toContain("persona");
  });

  it("does not carry a CRM ref (a persona is not a CRM record)", () => {
    const input = buildPersonaNodeInput("persona_hoa_board");
    expect(input.refTable == null).toBe(true);
    expect(input.refId == null).toBe(true);
  });
});

describe("crmChildRefs", () => {
  it("is the inverse of the belongs_to map: companies are referenced by contacts/properties/leads/jobs", () => {
    const children = crmChildRefs("companies");
    expect(children).toContainEqual({ table: "contacts", column: "company_id" });
    expect(children).toContainEqual({ table: "properties", column: "company_id" });
    expect(children).toContainEqual({ table: "leads", column: "company_id" });
    expect(children).toContainEqual({ table: "jobs", column: "company_id" });
    expect(children).toHaveLength(4);
  });

  it("leads are referenced by jobs and outcomes", () => {
    const children = crmChildRefs("leads");
    expect(children).toContainEqual({ table: "jobs", column: "lead_id" });
    expect(children).toContainEqual({ table: "outcomes", column: "lead_id" });
    expect(children).toHaveLength(2);
  });

  it("outcomes are a leaf — nothing references them", () => {
    expect(crmChildRefs("outcomes")).toEqual([]);
  });
});
