import { describe, expect, it } from "vitest";

import { navItems } from "../growth-engine";

describe("navItems", () => {
  it("includes a Campaigns entry pointing at /campaigns", () => {
    const campaigns = navItems.find((item) => item.href === "/campaigns");
    expect(campaigns).toBeDefined();
    expect(campaigns?.label).toBe("Campaigns");
  });

  it("includes an Arc entry pointing at /arc", () => {
    const arc = navItems.find((item) => item.href === "/arc");
    expect(arc?.label).toBe("Arc");
  });

  it("includes an Opportunities entry pointing at /opportunities", () => {
    const opportunities = navItems.find((item) => item.href === "/opportunities");
    expect(opportunities?.label).toBe("Opportunities");
  });

  it("exposes Arc first, then Campaigns, then Opportunities", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).toEqual(["Arc", "Campaigns", "Opportunities"]);
  });
});
