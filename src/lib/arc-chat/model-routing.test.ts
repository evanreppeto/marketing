import { describe, expect, it } from "vitest";

import { resolveArcModelRoute } from "./model-routing";

describe("resolveArcModelRoute", () => {
  it("preserves an explicit Spark or Forge choice", () => {
    expect(resolveArcModelRoute({ preference: "fast", request: "Build a campaign" })).toBe("fast");
    expect(resolveArcModelRoute({ preference: "standard", request: "Hello" })).toBe("standard");
  });

  it("uses Spark for direct conversational requests in auto mode", () => {
    expect(resolveArcModelRoute({ preference: "auto", request: "Hello, what can you help me with?" })).toBe("fast");
  });

  it("uses Forge for structured work in auto mode", () => {
    expect(resolveArcModelRoute({ preference: "auto", request: "Analyze our campaign performance" })).toBe("standard");
    expect(resolveArcModelRoute({ preference: "auto", request: "Draft a follow-up email" })).toBe("standard");
    expect(resolveArcModelRoute({ preference: "auto", command: "find-leads" })).toBe("standard");
  });
});
