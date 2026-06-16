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

  it("exposes Arc first, then Campaigns, and nothing else", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).toEqual(["Arc", "Campaigns"]);
  });
});
