import { describe, expect, it } from "vitest";
import { buildNodeInputForCrmRow, crmNodeKey, embedHash, CRM_NODE_KINDS } from "../brain-ingestion";

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
