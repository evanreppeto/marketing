import { describe, expect, it } from "vitest";
import { buildEdgesForCrmRow, buildNodeInputForCrmRow, crmNodeKey, embedHash, CRM_NODE_KINDS } from "../brain-ingestion";

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
