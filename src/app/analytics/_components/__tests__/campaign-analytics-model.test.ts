import { describe, expect, it } from "vitest";

import { buildFunnel, buildChannelBreakdown, buildComposition } from "../campaign-analytics-model";

describe("buildFunnel", () => {
  it("computes readiness as approved/total percent", () => {
    expect(buildFunnel({ approved: 3, pending: 1, changes: 0, total: 4 })).toEqual({
      approved: 3,
      pending: 1,
      changes: 0,
      total: 4,
      readiness: 75,
    });
  });

  it("returns 0 readiness when there are no pieces", () => {
    expect(buildFunnel({ approved: 0, pending: 0, changes: 0, total: 0 }).readiness).toBe(0);
  });
});

describe("buildChannelBreakdown", () => {
  it("groups assets by channel and sorts by count descending", () => {
    const assets = [
      { channel: "Email" },
      { channel: "Meta" },
      { channel: "Email" },
      { channel: "" },
    ];
    expect(buildChannelBreakdown(assets)).toEqual([
      { channel: "Email", count: 2 },
      { channel: "Meta", count: 1 },
      { channel: "Unassigned", count: 1 },
    ]);
  });

  it("returns an empty array when there are no assets", () => {
    expect(buildChannelBreakdown([])).toEqual([]);
  });
});

describe("buildComposition", () => {
  it("maps metric counts into labeled composition rows", () => {
    const rows = buildComposition({ assets: 5, approvals: 2, media: 3, sources: 4 });
    expect(rows).toEqual([
      { label: "Deliverables", value: 5 },
      { label: "Approval items", value: 2 },
      { label: "Media signals", value: 3 },
      { label: "Source records", value: 4 },
    ]);
  });
});
