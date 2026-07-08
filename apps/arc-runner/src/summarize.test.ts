import { describe, expect, it } from "vitest";

import { buildSummaryPrompt } from "./summarize";

describe("buildSummaryPrompt", () => {
  it("includes the prior summary and the overflow turns, oldest first", () => {
    const prompt = buildSummaryPrompt("Earlier: operator wants storm-damage leads.", [
      { role: "operator", body: "Also target property managers." },
      { role: "arc", body: "Noted — added a property-manager segment." },
    ]);
    expect(prompt).toContain("EXISTING SUMMARY:");
    expect(prompt).toContain("storm-damage leads");
    expect(prompt).toContain("Operator: Also target property managers.");
    expect(prompt).toContain("Arc: Noted — added a property-manager segment.");
    // oldest-first ordering preserved
    expect(prompt.indexOf("property managers")).toBeLessThan(prompt.indexOf("property-manager segment"));
  });

  it("marks the absence of a prior summary", () => {
    const prompt = buildSummaryPrompt(null, [{ role: "operator", body: "hi" }]);
    expect(prompt).toContain("EXISTING SUMMARY: (none yet)");
  });
});
