import { describe, expect, it } from "vitest";

import { parseArcMode, parseArcRoute } from "../arc-chat";

describe("parseArcMode", () => {
  it("accepts the three valid modes", () => {
    expect(parseArcMode("ask")).toBe("ask");
    expect(parseArcMode("act")).toBe("act");
    expect(parseArcMode("draft")).toBe("draft");
  });
  it("defaults unknown / empty / non-string to action-capable mode", () => {
    expect(parseArcMode("nonsense")).toBe("act");
    expect(parseArcMode("")).toBe("act");
    expect(parseArcMode(undefined)).toBe("act");
    expect(parseArcMode(42)).toBe("act");
  });
});

describe("parseArcRoute", () => {
  it("accepts the two valid model routes", () => {
    expect(parseArcRoute("fast")).toBe("fast");
    expect(parseArcRoute("standard")).toBe("standard");
  });

  it("defaults unknown / empty / non-string routes to fast", () => {
    expect(parseArcRoute("expensive")).toBe("fast");
    expect(parseArcRoute("")).toBe("fast");
    expect(parseArcRoute(undefined)).toBe("fast");
    expect(parseArcRoute(42)).toBe("fast");
  });
});
