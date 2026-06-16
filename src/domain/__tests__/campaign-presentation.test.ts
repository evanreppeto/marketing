import { describe, expect, it } from "vitest";
import {
  campaignLifecycleTone,
  campaignDriver,
  needsYouCount,
} from "../campaign-presentation";

describe("campaignLifecycleTone", () => {
  it("maps lifecycle to a theme tone (needs-you is gold/amber, never red)", () => {
    expect(campaignLifecycleTone("In review")).toBe("amber");
    expect(campaignLifecycleTone("Live")).toBe("green");
    expect(campaignLifecycleTone("Ready")).toBe("blue");
    expect(campaignLifecycleTone("Drafting")).toBe("gray");
  });
});

describe("campaignDriver", () => {
  it("operator-authored campaigns are operator-driven", () => {
    expect(campaignDriver({ sourceSystem: "operator", lifecycle: "Ready" })).toBe("operator");
  });
  it("Arc-authored campaigns are agent-driven", () => {
    expect(campaignDriver({ sourceSystem: "arc_saved", lifecycle: "Ready" })).toBe("agent");
  });
  it("a Drafting campaign is agent-driven regardless of source (Arc is actively building)", () => {
    expect(campaignDriver({ sourceSystem: "operator", lifecycle: "Drafting" })).toBe("agent");
  });
});

describe("needsYouCount", () => {
  it("is the pending count when in review, else zero", () => {
    expect(needsYouCount({ lifecycle: "In review", pendingCount: 2 })).toBe(2);
    expect(needsYouCount({ lifecycle: "Live", pendingCount: 0 })).toBe(0);
    expect(needsYouCount({ lifecycle: "Ready", pendingCount: 3 })).toBe(0);
  });
});
