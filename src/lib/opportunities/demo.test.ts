import { describe, expect, it } from "vitest";

import { buildDemoOpportunities } from "./demo";

describe("buildDemoOpportunities", () => {
  it("uses neutral growth examples by default", () => {
    const opportunities = buildDemoOpportunities("general");
    const copy = opportunities.map((opportunity) => `${opportunity.title} ${opportunity.summary}`).join(" ");

    expect(opportunities.length).toBeGreaterThan(0);
    expect(copy).not.toMatch(/water damage|flood|restoration|mitigation/i);
    expect(opportunities.some((opportunity) => opportunity.evidence?.persona === "new-lead")).toBe(true);
  });

  it("uses the selected industry's persona pack", () => {
    const opportunities = buildDemoOpportunities("saas");

    expect(opportunities.some((opportunity) => opportunity.evidence?.persona === "free-trial")).toBe(true);
  });

  it("preserves the restoration showcase behind the explicit industry setting", () => {
    const opportunities = buildDemoOpportunities("restoration");

    expect(opportunities.some((opportunity) => /water|flood|mitigation/i.test(`${opportunity.title} ${opportunity.summary}`))).toBe(true);
  });
});
