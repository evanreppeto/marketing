import { describe, expect, it } from "vitest";

import { resolveArcComposerMode } from "./composer-mode";

describe("resolveArcComposerMode", () => {
  it("keeps ordinary chat and research action-capable", () => {
    expect(resolveArcComposerMode({ request: "What should we work on today?" })).toBe("act");
    expect(resolveArcComposerMode({ request: "Find and rank our strongest leads" })).toBe("act");
  });

  it("uses draft framing for content creation", () => {
    expect(resolveArcComposerMode({ request: "Draft a follow-up email" })).toBe("draft");
  });

  it("does not let a legacy read-only command downgrade the conversation", () => {
    expect(resolveArcComposerMode({ request: "Research Acme", commandMode: "ask" })).toBe("act");
    expect(resolveArcComposerMode({ request: "Build the campaign", commandMode: "draft" })).toBe("draft");
  });
});
