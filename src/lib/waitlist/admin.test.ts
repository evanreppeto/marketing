import { describe, expect, it } from "vitest";

import { isPlatformAdmin, parsePlatformAdmins } from "./admin";

describe("parsePlatformAdmins", () => {
  it("splits, trims, and lowercases the allowlist", () => {
    expect(parsePlatformAdmins(" A@x.com , b@Y.com ")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("treats unset/empty as an empty allowlist", () => {
    expect(parsePlatformAdmins(undefined)).toEqual([]);
    expect(parsePlatformAdmins(null)).toEqual([]);
    expect(parsePlatformAdmins("")).toEqual([]);
    expect(parsePlatformAdmins(" , ,, ")).toEqual([]);
  });
});

describe("isPlatformAdmin", () => {
  it("denies everyone when the allowlist is unset — the safe default", () => {
    expect(isPlatformAdmin("someone@example.com", undefined)).toBe(false);
    expect(isPlatformAdmin("someone@example.com", "")).toBe(false);
  });

  it("allows only listed emails, case- and whitespace-insensitively", () => {
    const list = "owner@example.com,cofounder@example.com";
    expect(isPlatformAdmin("owner@example.com", list)).toBe(true);
    expect(isPlatformAdmin("  OWNER@Example.com ", list)).toBe(true);
    expect(isPlatformAdmin("cofounder@example.com", list)).toBe(true);
  });

  it("denies non-listed emails and missing identities", () => {
    const list = "owner@example.com";
    expect(isPlatformAdmin("intruder@example.com", list)).toBe(false);
    expect(isPlatformAdmin("", list)).toBe(false);
    expect(isPlatformAdmin(null, list)).toBe(false);
    expect(isPlatformAdmin(undefined, list)).toBe(false);
  });

  it("does not match on substrings or partial domains", () => {
    const list = "owner@example.com";
    expect(isPlatformAdmin("owner@example.com.attacker.io", list)).toBe(false);
    expect(isPlatformAdmin("notowner@example.com", list)).toBe(false);
  });
});
