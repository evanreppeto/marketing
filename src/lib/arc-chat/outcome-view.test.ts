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

  it("treats recommendations in action-capable mode as analysis without implying a change", () => {
    const view = buildArcOutcomeView({
      request: "Compare our last three campaigns and recommend the next move.",
      response: "The retention campaign is the strongest next move.",
      mode: "act",
    });

    expect(view).toMatchObject({
      intent: "analysis",
      label: "Recommendation",
      headline: "The decision is ready to inspect.",
      safetyLabel: "No changes recorded",
    });
  });

  it("does not claim an explicit action completed when no workspace effect was recorded", () => {
    const view = buildArcOutcomeView({
      request: "Update the campaign owner",
      response: "I attempted to update the campaign owner.",
      mode: "act",
      actions: [{ kind: "result", title: "Campaign", rows: [], flags: [] }],
    });

    expect(view).toMatchObject({
      intent: "action",
      label: "No change recorded",
      headline: "No workspace change was recorded.",
      body: "I attempted to update the campaign owner.",
      safetyLabel: "No changes recorded",
    });
    expect(view.badges).toEqual([]);
  });

  it("claims creation only when a reviewable draft is present", () => {
    const view = buildArcOutcomeView({
      request: "Update the campaign with a new email draft",
      response: "The email is ready for review.",
      mode: "act",
      actions: [{ kind: "draft", title: "Email", rows: [], flags: [], status: "draft" }],
    });

    expect(view).toMatchObject({
      intent: "action",
      label: "Created",
      headline: "Reviewable work is ready.",
      safetyLabel: "Nothing sent",
      badges: [{ kind: "created", label: "1 deliverable" }],
    });
  });
});
