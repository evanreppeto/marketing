import { describe, expect, it } from "vitest";

import { withCrmNames, type CrmNameMaps } from "./names";

const names: CrmNameMaps = {
  companies: new Map([["co_1", "North Shore Property Group"]]),
  contacts: new Map([["ct_1", "Dana Whitfield"]]),
};

describe("withCrmNames", () => {
  it("names the record instead of leaving Arc only a uuid to quote", () => {
    // The bug: Arc wrote "their companies 08b76650, 5ddcc386, 27333a56 are all
    // tagged plumbing_partner" into an operator-facing card, because companyId was
    // the only handle it had.
    const row = withCrmNames({ id: "o1", companyId: "co_1", contactId: "ct_1" }, names);
    expect(row.companyName).toBe("North Shore Property Group");
    expect(row.contactName).toBe("Dana Whitfield");
  });

  it("keeps the ids — Arc still needs them to fetch and to link records", () => {
    const row = withCrmNames({ id: "o1", companyId: "co_1", contactId: "ct_1" }, names);
    expect(row.companyId).toBe("co_1");
    expect(row.contactId).toBe("ct_1");
  });

  it("gives null, never the uuid, when a name can't be resolved", () => {
    // Falling back to the id would reintroduce the exact thing this removes.
    const row = withCrmNames({ id: "o2", companyId: "co_missing", contactId: "ct_missing" }, names);
    expect(row.companyName).toBeNull();
    expect(row.contactName).toBeNull();
    expect(row.companyName).not.toBe("co_missing");
  });

  it("handles a record with no company/contact link at all", () => {
    const row = withCrmNames({ id: "o3", companyId: null, contactId: undefined }, names);
    expect(row.companyName).toBeNull();
    expect(row.contactName).toBeNull();
  });

  it("leaves the rest of the record untouched", () => {
    const row = withCrmNames({ id: "o4", companyId: "co_1", status: "won", grossRevenueCents: 1_240_000 }, names);
    expect(row.id).toBe("o4");
    expect(row.status).toBe("won");
    expect(row.grossRevenueCents).toBe(1_240_000);
  });

  it("does not mutate the input row", () => {
    const input = { id: "o5", companyId: "co_1" };
    withCrmNames(input, names);
    expect(input).not.toHaveProperty("companyName");
  });
});
