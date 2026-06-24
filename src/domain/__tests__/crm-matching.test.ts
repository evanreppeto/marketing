import { describe, expect, it } from "vitest";

import {
  isWithinWindow,
  normalizeAddressKey,
  normalizeDomain,
  normalizeEmailKey,
  normalizePhoneKey,
} from "../crm-matching";

describe("crm matching normalizers", () => {
  it("lowercases and trims email", () => {
    expect(normalizeEmailKey("  John.Doe@Acme.COM ")).toBe("john.doe@acme.com");
    expect(normalizeEmailKey("")).toBeNull();
    expect(normalizeEmailKey(undefined)).toBeNull();
  });

  it("reduces phone to digits, dropping a US country prefix", () => {
    expect(normalizePhoneKey("+1 (312) 555-0188")).toBe("3125550188");
    expect(normalizePhoneKey("312.555.0188")).toBe("3125550188");
    expect(normalizePhoneKey("123")).toBeNull();
  });

  it("extracts a bare host from a url or domain", () => {
    expect(normalizeDomain("https://www.Acme.com/contact")).toBe("acme.com");
    expect(normalizeDomain("Acme.com")).toBe("acme.com");
    expect(normalizeDomain("not a domain")).toBeNull();
  });

  it("builds a stable street+postal key", () => {
    expect(normalizeAddressKey("  123  Main   St. ", "60601")).toBe("123 main st|60601");
    expect(normalizeAddressKey("", "60601")).toBeNull();
  });

  it("compares ISO timestamps within a window", () => {
    expect(isWithinWindow("2026-06-24T10:00:00Z", "2026-06-24T10:05:00Z", 600_000)).toBe(true);
    expect(isWithinWindow("2026-06-24T10:00:00Z", "2026-06-24T10:20:00Z", 600_000)).toBe(false);
  });
});
