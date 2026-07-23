import { describe, expect, it } from "vitest";

import { buildArcOutcomeView } from "./outcome-view";

describe("buildArcOutcomeView", () => {
  it("promotes a meaningful markdown heading and removes the duplicate heading from the body", () => {
    const view = buildArcOutcomeView({
      request: "Analyze the strongest opportunity",
      response: "## Rebuild homeowners are the best opportunity\n\nThe CRM contains 21 leads.",
      mode: "ask",
      sourceCount: 3,
    });

    expect(view).toMatchObject({
      intent: "analysis",
      headline: "Rebuild homeowners are the best opportunity",
      body: "The CRM contains 21 leads.",
      safetyLabel: "Read only",
      badges: [{ kind: "sources", label: "3 sources" }],
    });
  });

  it("adds only evidence badges supported by the response", () => {
    const view = buildArcOutcomeView({
      request: "Draft the email",
      response: "The draft is ready. One limitation: audience recency is unknown.",
      mode: "draft",
      recallCount: 2,
      actions: [{ kind: "draft", title: "Email", rows: [], flags: [], status: "draft" }],
    });

    expect(view.badges.map((badge) => badge.kind)).toEqual(["memory", "created", "limitation"]);
    expect(view.safetyLabel).toBe("Nothing sent");
  });
});
