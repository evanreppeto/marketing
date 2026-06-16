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
  it("accepts the current Claude model routes", () => {
    expect(parseMarkRoute("claude-fable-5")).toBe("claude-fable-5");
    expect(parseMarkRoute("claude-opus-4-8")).toBe("claude-opus-4-8");
    expect(parseMarkRoute("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(parseMarkRoute("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("maps legacy route names to current Claude model routes", () => {
    expect(parseMarkRoute("fast")).toBe("claude-haiku-4-5");
    expect(parseMarkRoute("standard")).toBe("claude-sonnet-4-6");
  });

  it("defaults unknown / empty / non-string routes to Sonnet", () => {
    expect(parseMarkRoute("expensive")).toBe("claude-sonnet-4-6");
    expect(parseMarkRoute("")).toBe("claude-sonnet-4-6");
    expect(parseMarkRoute(undefined)).toBe("claude-sonnet-4-6");
    expect(parseMarkRoute(42)).toBe("claude-sonnet-4-6");
  });
});
