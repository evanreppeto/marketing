import { describe, expect, it } from "vitest";

import { pickAllowedFields, validateRecordEnums } from "../record-writes";

describe("pickAllowedFields", () => {
  it("keeps only whitelisted columns for the table", () => {
    const out = pickAllowedFields("leads", {
      persona: "persona_plumbing_partner",
      lead_score: 80,
      id: "should-be-dropped",
      org_id: "should-be-dropped",
      not_a_column: true,
    });
    expect(out).toEqual({ persona: "persona_plumbing_partner", lead_score: 80 });
  });

  it("returns an empty object when nothing is allowed", () => {
    expect(pickAllowedFields("contacts", { id: "x", bogus: 1 })).toEqual({});
  });

  it("strips review_status — the review gate is human-only to change", () => {
    expect(pickAllowedFields("companies", { review_status: "active", name: "Acme" })).toEqual({
      name: "Acme",
    });
  });

  it("strips lead FK link columns — re-linking is not an allowed update", () => {
    expect(
      pickAllowedFields("leads", { company_id: "x", contact_id: "y", lead_score: 50 }),
    ).toEqual({ lead_score: 50 });
  });
});

describe("validateRecordEnums", () => {
  it("accepts valid enum values per table", () => {
    expect(validateRecordEnums("leads", { status: "qualified", routing_recommendation: "elevated", persona: "persona_landlord" }).ok).toBe(true);
    expect(validateRecordEnums("companies", { status: "active", partner_tier: "A" }).ok).toBe(true);
    expect(validateRecordEnums("contacts", { status: "do_not_contact" }).ok).toBe(true);
  });

  it("rejects a value valid for another table's enum (lead status has no 'active')", () => {
    const res = validateRecordEnums("leads", { status: "active" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("status");
  });

  it("rejects an unknown persona but accepts an official one", () => {
    expect(validateRecordEnums("leads", { persona: "homeowner" }).ok).toBe(false);
    expect(validateRecordEnums("leads", { persona: "persona_plumbing_partner" }).ok).toBe(true);
  });

  it("rejects an out-of-range routing_recommendation and partner_tier", () => {
    expect(validateRecordEnums("leads", { routing_recommendation: "hot" }).ok).toBe(false);
    expect(validateRecordEnums("companies", { partner_tier: "D" }).ok).toBe(false);
  });

  it("accepts an in-range lead_score and ignores free-text fields", () => {
    expect(validateRecordEnums("leads", { lead_score: 80, loss_summary: "burst pipe" }).ok).toBe(true);
    expect(validateRecordEnums("contacts", { first_name: "Sam", email: "a@b.co" }).ok).toBe(true);
  });

  it("rejects an out-of-range, non-integer, or non-number lead_score (DB CHECK 0..100)", () => {
    expect(validateRecordEnums("leads", { lead_score: 999 }).ok).toBe(false);
    expect(validateRecordEnums("leads", { lead_score: -1 }).ok).toBe(false);
    expect(validateRecordEnums("leads", { lead_score: 50.5 }).ok).toBe(false);
    // Strings must not be coerced — "" -> 0 / "0x10" -> 16 would slip past and 502.
    expect(validateRecordEnums("leads", { lead_score: "" }).ok).toBe(false);
    expect(validateRecordEnums("leads", { lead_score: "80" }).ok).toBe(false);
    expect(validateRecordEnums("leads", { lead_score: 0 }).ok).toBe(true);
    expect(validateRecordEnums("leads", { lead_score: 100 }).ok).toBe(true);
  });

  it("rejects an empty/whitespace companies.name (DB CHECK length>0)", () => {
    expect(validateRecordEnums("companies", { name: "" }).ok).toBe(false);
    expect(validateRecordEnums("companies", { name: "   " }).ok).toBe(false);
    expect(validateRecordEnums("companies", { name: "Acme" }).ok).toBe(true);
  });
});
