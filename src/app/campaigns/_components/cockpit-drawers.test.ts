import { describe, expect, it } from "vitest";

import { DRAWER_KEYS, drawerForUrl, isDrawerKey } from "./cockpit-drawers";

describe("cockpit drawer mapping", () => {
  it("exposes the secondary panels as drawer keys", () => {
    expect(DRAWER_KEYS).toEqual([
      "reasoning",
      "approvals",
      "performance",
      "audit",
      "dispatch",
      "media",
      "economics",
      "brief",
    ]);
  });

  it("validates drawer keys", () => {
    expect(isDrawerKey("reasoning")).toBe(true);
    expect(isDrawerKey("nope")).toBe(false);
    expect(isDrawerKey(null)).toBe(false);
  });

  it("opens the Decision log drawer when a deep-linked item is present", () => {
    expect(drawerForUrl({ drawer: null, item: "appr_123" })).toBe("approvals");
  });

  it("prefers an explicit valid drawer param over item", () => {
    expect(drawerForUrl({ drawer: "performance", item: "appr_123" })).toBe("performance");
  });

  it("returns null when nothing selects a drawer", () => {
    expect(drawerForUrl({ drawer: null, item: null })).toBe(null);
    expect(drawerForUrl({ drawer: "bogus", item: null })).toBe(null);
  });
});
