import { describe, expect, it } from "vitest";

import { DISPATCH_STATUS_ORDER, groupByStatus, statusLabel, type DispatchView } from "./status";

function view(id: string, status: DispatchView["status"]): DispatchView {
  return {
    id, campaignId: "c1", campaignName: "Spring push", assetId: "a1",
    deliverable: "Welcome email", channel: "Email", status,
    scheduledFor: null, dispatchedAt: null, recipientSummary: "12 leads",
    audienceCount: 12, resultNote: null, updatedAt: "Jun 5",
  };
}

describe("dispatch status helpers", () => {
  it("labels statuses for display", () => {
    expect(statusLabel("queued")).toBe("Queued");
    expect(statusLabel("delivered")).toBe("Delivered");
  });

  it("groups dispatches by status in lifecycle order", () => {
    const groups = groupByStatus([view("1", "sent"), view("2", "queued"), view("3", "queued")]);
    expect(groups.map((g) => g.status)).toEqual(DISPATCH_STATUS_ORDER);
    expect(groups.find((g) => g.status === "queued")?.items.map((i) => i.id)).toEqual(["2", "3"]);
    expect(groups.find((g) => g.status === "sent")?.items).toHaveLength(1);
    expect(groups.find((g) => g.status === "delivered")?.items).toEqual([]);
  });
});
