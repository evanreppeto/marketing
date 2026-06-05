import { describe, expect, it } from "vitest";

import { navItems } from "../growth-engine";

describe("navItems", () => {
  it("includes a Campaigns entry pointing at /campaigns", () => {
    const campaigns = navItems.find((item) => item.href === "/campaigns");
    expect(campaigns).toBeDefined();
    expect(campaigns?.label).toBe("Campaigns");
  });

  it("orders Campaigns immediately after Activity", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels.indexOf("Campaigns")).toBe(labels.indexOf("Activity") + 1);
  });
});
