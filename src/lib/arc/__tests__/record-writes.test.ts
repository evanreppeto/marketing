import { describe, expect, it } from "vitest";

import { pickAllowedFields } from "../record-writes";

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
