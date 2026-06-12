import { describe, expect, it } from "vitest";

import { parseMarkMode, parseMarkRoute } from "../mark-chat";

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

describe("parseMarkRoute", () => {
  it("accepts the two valid model routes", () => {
    expect(parseMarkRoute("fast")).toBe("fast");
    expect(parseMarkRoute("standard")).toBe("standard");
  });

  it("defaults unknown / empty / non-string routes to fast", () => {
    expect(parseMarkRoute("expensive")).toBe("fast");
    expect(parseMarkRoute("")).toBe("fast");
    expect(parseMarkRoute(undefined)).toBe("fast");
    expect(parseMarkRoute(42)).toBe("fast");
  });
});
