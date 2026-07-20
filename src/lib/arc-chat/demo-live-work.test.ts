import { describe, expect, it } from "vitest";

import { buildDemoLiveWork } from "./demo-live-work";

describe("buildDemoLiveWork", () => {
  it("grounds a draft preview in the actual channel and subject", () => {
    const work = buildDemoLiveWork("Write an email for the spring property-manager campaign");

    expect(work.commentary).toContain("email draft");
    expect(work.commentary).toContain("spring property-manager campaign");
    expect(work.rows.some((row) => row.label.includes("CRM records"))).toBe(true);
    expect(work.rows.at(-1)?.label).toContain("email draft");
  });

  it("does not replay the same script for different requests in one intent", () => {
    const homeowners = buildDemoLiveWork("Find homeowners affected by the Naperville hailstorm");
    const competitors = buildDemoLiveWork("Find roofing competitors advertising in Aurora");

    expect(homeowners.commentary).not.toBe(competitors.commentary);
    expect(homeowners.rows.map((row) => row.label)).not.toEqual(competitors.rows.map((row) => row.label));
    expect(homeowners.commentary).toContain("homeowners affected by Naperville hailstorm");
    expect(competitors.commentary).toContain("roofing competitors advertising Aurora");
  });

  it("falls back to a request-specific grounded answer plan", () => {
    const work = buildDemoLiveWork("Explain why our July conversion rate changed");

    expect(work.commentary).toContain("July conversion rate changed");
    expect(work.rows.at(-1)?.label).toContain("July conversion rate changed");
  });
});
