import { describe, expect, it } from "vitest";

import { resolveArcModelRoute } from "./model-routing";

describe("resolveArcModelRoute", () => {
  it("preserves an explicit Spark or Forge choice", () => {
    expect(resolveArcModelRoute({ preference: "fast", request: "Build a campaign" })).toBe("fast");
    expect(resolveArcModelRoute({ preference: "standard", request: "Hello" })).toBe("standard");
  });

  it("uses Spark for conversation, research, and analysis in auto mode", () => {
    expect(resolveArcModelRoute({ preference: "auto", request: "Hello, what can you help me with?" })).toBe("fast");
    expect(resolveArcModelRoute({ preference: "auto", request: "Find and rank our strongest leads" })).toBe("fast");
    expect(resolveArcModelRoute({ preference: "auto", request: "Analyze campaign performance" })).toBe("fast");
    expect(resolveArcModelRoute({ preference: "auto", command: "find-leads" })).toBe("fast");
  });

  it("reserves Forge for creation and workspace actions in auto mode", () => {
    expect(resolveArcModelRoute({ preference: "auto", request: "Draft a follow-up email" })).toBe("standard");
    expect(resolveArcModelRoute({ preference: "auto", request: "Update this lead's status" })).toBe("standard");
  });
});
