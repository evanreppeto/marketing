import { describe, expect, it } from "vitest";

import {
  csvRowId,
  csvRowToContact,
  detectColumnMapping,
  mapCsvRow,
  parseCsv,
  parseCsvContacts,
} from "@/domain";

describe("parseCsv", () => {
  it("splits simple rows and drops blank lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n4,5,6")).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
  });

  it("handles quoted fields with commas and newlines inside", () => {
    const rows = parseCsv('name,note\n"Vega, Jordan","line one\nline two"');
    expect(rows[1]).toEqual(["Vega, Jordan", "line one\nline two"]);
  });

  it("handles escaped quotes and CRLF", () => {
    const rows = parseCsv('a\r\n"she said ""hi"""\r\n');
    expect(rows).toEqual([["a"], ['she said "hi"']]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("detectColumnMapping", () => {
  it("maps common header aliases regardless of case/spacing", () => {
    const m = detectColumnMapping(["First Name", "Last_Name", "E-Mail", "Company Name", "Mobile"]);
    expect(m).toEqual({ 0: "firstName", 1: "lastName", 2: "email", 3: "company", 4: "phone" });
  });

  it("maps a single full-name column", () => {
    expect(detectColumnMapping(["Full Name", "email"])).toEqual({ 0: "name", 1: "email" });
  });

  it("first column wins a field — a later duplicate can't clobber it", () => {
    const m = detectColumnMapping(["email", "work email"]);
    expect(m).toEqual({ 0: "email" });
  });

  it("ignores unknown headers", () => {
    expect(detectColumnMapping(["email", "favorite color"])).toEqual({ 0: "email" });
  });
});

describe("mapCsvRow", () => {
  it("applies the mapping to a data row", () => {
    const m = { 0: "email" as const, 1: "company" as const };
    expect(mapCsvRow(["a@b.com", "Acme"], m)).toEqual({ email: "a@b.com", company: "Acme" });
  });

  it("splits a full-name column into first + last", () => {
    expect(mapCsvRow(["Jordan Vega Cruz"], { 0: "name" })).toEqual({ firstName: "Jordan", lastName: "Vega Cruz" });
  });

  it("does not overwrite an explicitly-mapped first/last with a name column split", () => {
    // firstName mapped separately, name column also present — keep the explicit one.
    const row = mapCsvRow(["Jo", "Jordan Vega"], { 0: "firstName", 1: "name" });
    expect(row.firstName).toBe("Jo");
    expect(row.lastName).toBe("Vega");
  });
});

describe("csvRowId — stable dedup key", () => {
  it("prefers email, case-insensitive", () => {
    expect(csvRowId({ email: "A@B.com" })).toBe("csv:a@b.com");
  });
  it("falls back to normalized phone, then a content hash", () => {
    expect(csvRowId({ phone: "(312) 555-1212" })).toBe("csv:3125551212");
    const a = csvRowId({ firstName: "Jordan", company: "Acme" });
    expect(a).toMatch(/^csv:h/);
    expect(csvRowId({ firstName: "Jordan", company: "Acme" })).toBe(a); // stable
  });
  it("is namespaced so it can't collide with a HubSpot object id", () => {
    expect(csvRowId({ email: "x@y.com" }).startsWith("csv:")).toBe(true);
  });
});

describe("csvRowToContact", () => {
  it("emits the engine's property keys (firstname/lastname/email/…)", () => {
    const c = csvRowToContact({ firstName: "Jordan", lastName: "Vega", email: "j@v.com", company: "Acme", city: "Chicago", state: "IL", zip: "60601" });
    expect(c?.properties).toEqual({ firstname: "Jordan", lastname: "Vega", email: "j@v.com", company: "Acme", city: "Chicago", state: "IL", zip: "60601" });
    expect(c?.id).toBe("csv:j@v.com");
  });
  it("returns null for a row with no name/email/phone", () => {
    expect(csvRowToContact({ company: "Acme", city: "Chicago" })).toBeNull();
  });
});

describe("parseCsvContacts — end to end", () => {
  const CSV = `First Name,Last Name,Email,Company,Phone,City,State
Jordan,Vega,jordan@acme.com,Acme Restoration,312-555-1000,Chicago,IL
Dana,Whitfield,dana@northshore.com,North Shore Group,,Evanston,IL
,,,,,,
,,,Ghost Co,,,`;

  it("maps rows to contacts, reports recognised columns, and counts skips", () => {
    const s = parseCsvContacts(CSV);
    expect(s.totalRows).toBe(3); // the all-blank line is dropped by parseCsv; 3 data rows remain
    expect(s.contacts.map((c) => c.id)).toEqual(["csv:jordan@acme.com", "csv:dana@northshore.com"]);
    expect(s.skipped).toBe(1); // "Ghost Co" has only a company — no name/email/phone
    expect(s.mappedColumns).toMatchObject({ firstName: "First Name", email: "Email", company: "Company" });
  });

  it("dedupes the same email appearing twice in one paste", () => {
    const dup = "email,company\na@b.com,One\na@b.com,Two";
    expect(parseCsvContacts(dup).contacts).toHaveLength(1);
  });

  it("returns nothing usable for a header-only or empty CSV", () => {
    expect(parseCsvContacts("name,email").contacts).toEqual([]);
    expect(parseCsvContacts("").contacts).toEqual([]);
  });
});
