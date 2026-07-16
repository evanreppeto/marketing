import { describe, expect, it } from "vitest";

import { buildColdLeadLabel } from "@/domain";

/**
 * The inbox is triage: the operator scans it deciding who to chase. A card that
 * can't say who it's about is dead weight, and 64 of prod's 82 open cards read
 * "Lead c1aa307a — quiet 32 days" while a contact and company name existed for
 * every one of them. These tests pin the preference order that fixes that.
 */
describe("buildColdLeadLabel", () => {
  const id = "c1aa307a-1111-2222-3333-444444444444";

  it("names the card after the person and their account when both exist", () => {
    // One line an operator can act on: who to call, and which account it belongs to.
    expect(
      buildColdLeadLabel({ id, contactName: "Dana Whitfield", companyName: "North Shore Property Group" }),
    ).toBe("Dana Whitfield (North Shore Property Group)");
  });

  it("falls back through contact, then company, then loss summary, then the id", () => {
    expect(buildColdLeadLabel({ id, contactName: "Dana Whitfield" })).toBe("Dana Whitfield");
    expect(buildColdLeadLabel({ id, companyName: "North Shore Property Group" })).toBe("North Shore Property Group");
    expect(buildColdLeadLabel({ id, lossSummary: "Basement flood, 2 units" })).toBe("Basement flood, 2 units");
    expect(buildColdLeadLabel({ id })).toBe("Lead c1aa307a");
  });

  it("prefers a real name over a loss summary", () => {
    // The regression, exactly: the old code reached for lossSummary first. In prod
    // that field was set on 1 of 64 cold leads, so the name never won.
    expect(buildColdLeadLabel({ id, contactName: "Dana Whitfield", lossSummary: "Basement flood" })).toBe(
      "Dana Whitfield",
    );
  });

  it("treats blank and whitespace-only names as absent", () => {
    // A "" name must not win and title the card with nothing.
    expect(buildColdLeadLabel({ id, contactName: "   ", companyName: "" })).toBe("Lead c1aa307a");
    expect(buildColdLeadLabel({ id, contactName: null, companyName: undefined })).toBe("Lead c1aa307a");
    expect(buildColdLeadLabel({ id, contactName: "  ", companyName: "Acme" })).toBe("Acme");
  });

  it("keeps the card title a readable length", () => {
    const label = buildColdLeadLabel({
      id,
      contactName: "Bartholomew Fitzgerald-Montgomery III",
      companyName: "North Shore Property Management Group of Greater Chicagoland",
    });
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label.endsWith("…")).toBe(true);
    // Truncated, but still leads with the part that identifies the person.
    expect(label.startsWith("Bartholomew Fitzgerald-Montgomery III")).toBe(true);
  });

  it("never titles a card 'null' or 'undefined'", () => {
    const label = buildColdLeadLabel({ id, contactName: null, companyName: null, lossSummary: null });
    expect(label).not.toMatch(/null|undefined/);
  });
});
