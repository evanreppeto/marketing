import { describe, expect, it } from "vitest";

import { buildArcLauncherRecommendation } from "./launcher-state";

describe("buildArcLauncherRecommendation", () => {
  it("prioritizes time-sensitive work", () => {
    expect(buildArcLauncherRecommendation({
      approvals: 5,
      opportunities: 12,
      items: [{ id: "urgent", title: "Storm response", urgency: "high", prompt: "Draft the response." }],
    })).toMatchObject({ mode: "urgent", title: "Storm response", prompt: "Draft the response." });
  });

  it("changes to review-first when approvals are accumulating", () => {
    expect(buildArcLauncherRecommendation({ approvals: 4, opportunities: 8 })).toMatchObject({
      mode: "review",
      href: "/campaigns",
      title: "4 items are waiting for your decision",
    });
  });

  it("offers an orientation scan in a quiet workspace", () => {
    expect(buildArcLauncherRecommendation({ approvals: 0, opportunities: 0 })).toMatchObject({
      mode: "quiet",
      title: "See what changed since your last visit",
    });
  });
});
