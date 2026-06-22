import { describe, expect, it } from "vitest";

import { isCrmEntityType, recordPath, safeRecordPath } from "./record-path";

describe("safeRecordPath", () => {
  it("builds the record path for a known entity type", () => {
    expect(safeRecordPath("company", "abc")).toBe("/crm/companies/abc");
    expect(safeRecordPath("lead", "xyz")).toBe("/crm/leads/xyz");
  });

  it("falls back to the CRM root for an unknown entity type", () => {
    // Malformed/tampered form input must never produce "/crm/undefined/<id>".
    expect(safeRecordPath("bogus", "abc")).toBe("/crm");
    expect(safeRecordPath("", "abc")).toBe("/crm");
  });
});

describe("isCrmEntityType", () => {
  it("recognizes the canonical entity types and rejects others", () => {
    expect(isCrmEntityType("contact")).toBe(true);
    expect(isCrmEntityType("campaign")).toBe(true);
    expect(isCrmEntityType("nope")).toBe(false);
    expect(isCrmEntityType("companies")).toBe(false);
  });
});

describe("recordPath", () => {
  it("maps singular entity types to their plural URL segment", () => {
    expect(recordPath("property", "1")).toBe("/crm/properties/1");
  });
});
