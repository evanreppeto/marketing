import { describe, expect, it } from "vitest";

import { normalizeWaitlistEmail } from "./validate";

describe("normalizeWaitlistEmail", () => {
  it("accepts a normal email and normalizes case and whitespace", () => {
    expect(normalizeWaitlistEmail("  Evan@Example.COM ")).toEqual({
      ok: true,
      email: "evan@example.com",
    });
  });

  it("rejects non-strings and empty input", () => {
    expect(normalizeWaitlistEmail(undefined).ok).toBe(false);
    expect(normalizeWaitlistEmail(42).ok).toBe(false);
    expect(normalizeWaitlistEmail("   ").ok).toBe(false);
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["nope", "a@b", "a b@c.com", "@x.com", "a@.com"]) {
      expect(normalizeWaitlistEmail(bad).ok).toBe(false);
    }
  });

  it("rejects absurdly long addresses", () => {
    expect(normalizeWaitlistEmail(`${"a".repeat(260)}@example.com`).ok).toBe(false);
  });
});
