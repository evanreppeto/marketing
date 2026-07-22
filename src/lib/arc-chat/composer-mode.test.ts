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

  it("honors an explicit read-only or Ask-mode request", () => {
    expect(resolveArcComposerMode({ request: "Read-only verification: search the CRM and report the total." })).toBe("ask");
    expect(resolveArcComposerMode({ request: "In Ask mode, confirm Arc is responding." })).toBe("ask");
    expect(resolveArcComposerMode({ request: "Do not create, edit, or send anything; just report the count." })).toBe("ask");
  });

  it("does not mistake an outbound safety instruction for a read-only request", () => {
    expect(resolveArcComposerMode({ request: "Draft the email, but do not send it." })).not.toBe("ask");
  });

  it("does not let a legacy read-only command downgrade the conversation", () => {
    expect(resolveArcComposerMode({ request: "Research Acme", commandMode: "ask" })).toBe("act");
    expect(resolveArcComposerMode({ request: "Build the campaign", commandMode: "draft" })).toBe("draft");
  });
});
