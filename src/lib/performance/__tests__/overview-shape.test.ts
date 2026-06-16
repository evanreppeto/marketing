import { describe, expect, it } from "vitest";

import { buildTrendBuckets, computeDelta, sumTwoPeriods, buildTakeaway } from "../overview-shape";

const NOW = Date.UTC(2026, 5, 15);
const day = 24 * 60 * 60 * 1000;

describe("computeDelta", () => {
  it("returns up with rounded percent when current exceeds prior", () => {
    expect(computeDelta(120, 100)).toEqual({ pct: 20, dir: "up" });
  });
  it("returns down for a decrease", () => {
    expect(computeDelta(80, 100)).toEqual({ pct: 20, dir: "down" });
  });
  it("returns flat for no change", () => {
    expect(computeDelta(100, 100)).toEqual({ pct: 0, dir: "flat" });
  });
  it("returns null when there is no prior baseline", () => {
    expect(computeDelta(50, 0)).toBeNull();
  });
});

describe("sumTwoPeriods", () => {
  it("sums weights into current (last N days) and prior (the N days before that)", () => {
    const items = [
      { at: new Date(NOW - 2 * day).toISOString(), weight: 1 },
      { at: new Date(NOW - 10 * day).toISOString(), weight: 1 },
      { at: new Date(NOW - 40 * day).toISOString(), weight: 1 },
      { at: new Date(NOW - 90 * day).toISOString(), weight: 1 },
      { at: null, weight: 1 },
    ];
    expect(sumTwoPeriods(items, NOW, 30)).toEqual({ current: 2, prior: 1 });
  });
  it("sums dollar weights, not just counts", () => {
    const items = [{ at: new Date(NOW - 1 * day).toISOString(), weight: 500 }];
    expect(sumTwoPeriods(items, NOW, 30)).toEqual({ current: 500, prior: 0 });
  });
});

describe("buildTrendBuckets", () => {
  it("buckets leads and jobs into the last N weekly buckets, oldest first", () => {
    const leads = [{ created_at: new Date(NOW - 1 * day).toISOString() }, { created_at: new Date(NOW - 8 * day).toISOString() }];
    const jobs = [{ created_at: new Date(NOW - 2 * day).toISOString() }];
    const trend = buildTrendBuckets(leads, jobs, NOW, 3);
    expect(trend).toHaveLength(3);
    expect(trend[2]).toMatchObject({ leads: 1, bookings: 1 });
    expect(trend[1]).toMatchObject({ leads: 1, bookings: 0 });
    expect(trend[0]).toMatchObject({ leads: 0, bookings: 0 });
    expect(typeof trend[0].week).toBe("string");
  });
  it("returns N empty buckets when there is no data", () => {
    expect(buildTrendBuckets([], [], NOW, 4)).toHaveLength(4);
  });
});

describe("buildTakeaway", () => {
  it("celebrates when nothing is waiting", () => {
    const s = { approved: 10, pending: 0, changes: 0, draft: 0, total: 10, readiness: 100 };
    expect(buildTakeaway(s, 0)).toMatch(/caught up|all/i);
  });
  it("calls out waiting and changes when present", () => {
    const s = { approved: 6, pending: 2, changes: 1, draft: 1, total: 10, readiness: 60 };
    const text = buildTakeaway(s, 2);
    expect(text).toMatch(/60%/);
    expect(text).toMatch(/2/);
  });
  it("handles the empty portfolio", () => {
    const s = { approved: 0, pending: 0, changes: 0, draft: 0, total: 0, readiness: 0 };
    expect(buildTakeaway(s, 0)).toMatch(/no campaigns|nothing/i);
  });
});
