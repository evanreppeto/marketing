import { describe, expect, it } from "vitest";

import { parseMarkMode } from "../mark-chat";

describe("parseMarkMode", () => {
  it("accepts the three valid modes", () => {
    expect(parseMarkMode("ask")).toBe("ask");
    expect(parseMarkMode("act")).toBe("act");
    expect(parseMarkMode("draft")).toBe("draft");
  });
  it("defaults unknown / empty / non-string to 'ask'", () => {
    expect(parseMarkMode("nonsense")).toBe("ask");
    expect(parseMarkMode("")).toBe("ask");
    expect(parseMarkMode(undefined)).toBe("ask");
    expect(parseMarkMode(42)).toBe("ask");
  });
});
