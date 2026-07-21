import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ANALYTICS_WINDOWS, getAnalyticsOverview, normalizeWindow } from "./overview";

describe("normalizeWindow", () => {
  it("accepts the supported windows", () => {
    for (const n of ANALYTICS_WINDOWS) {
      expect(normalizeWindow(String(n))).toBe(n);
      expect(normalizeWindow(n)).toBe(n);
    }
  });

  it("defaults unsupported / junk values to 30", () => {
    for (const bad of ["1", "45", "0", "-7", "abc", "", undefined, null, {}, 3.5]) {
      expect(normalizeWindow(bad)).toBe(30);
    }
  });
});

describe("getAnalyticsOverview windowing (demo path)", () => {
  const prev = process.env.ARC_DEMO_DATA;
  beforeEach(() => {
    // No Supabase in test env → the demo branch runs; opt it in explicitly.
    process.env.ARC_DEMO_DATA = "1";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.ARC_DEMO_DATA;
    else process.env.ARC_DEMO_DATA = prev;
  });

  it("produces trend series and labels of exactly the requested window length", async () => {
    for (const n of ANALYTICS_WINDOWS) {
      const overview = await getAnalyticsOverview("org-test", n);
      expect(overview.trend.leads.cur).toHaveLength(n);
      expect(overview.trend.leads.prev).toHaveLength(n);
      expect(overview.trend.revenue.cur).toHaveLength(n);
      expect(overview.trend.bookings.cur).toHaveLength(n);
      expect(overview.trendLabels).toHaveLength(n);
    }
  });

  it("defaults to a 30-day window", async () => {
    const overview = await getAnalyticsOverview("org-test");
    expect(overview.trendLabels).toHaveLength(30);
  });

  it("scales the totals with the window — a 90-day span sums more leads than a 7-day one", async () => {
    const wide = await getAnalyticsOverview("org-test", 90);
    const narrow = await getAnalyticsOverview("org-test", 7);
    const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
    expect(sum(wide.trend.leads.cur)).toBeGreaterThan(sum(narrow.trend.leads.cur));
  });
});
