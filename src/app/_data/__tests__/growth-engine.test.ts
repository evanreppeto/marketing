import { describe, expect, it } from "vitest";

import { navItems } from "../growth-engine";

describe("navItems", () => {
  it("includes a Campaigns entry pointing at /campaigns", () => {
    const campaigns = navItems.find((item) => item.href === "/campaigns");
    expect(campaigns).toBeDefined();
    expect(campaigns?.label).toBe("Campaigns");
  });

  it("includes a Mark entry pointing at /mark", () => {
    const mark = navItems.find((item) => item.href === "/mark");
    expect(mark?.label).toBe("Mark");
  });

  it("exposes Mark first, then Campaigns, and nothing else", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).toEqual(["Mark", "Campaigns"]);
  });
});
