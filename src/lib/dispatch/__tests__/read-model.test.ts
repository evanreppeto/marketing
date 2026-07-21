import { describe, expect, it } from "vitest";

import { rowToDispatchView, type DispatchRow } from "../read-model";

const row: DispatchRow = {
  id: "d1", campaign_id: "c1", campaign_asset_id: "a1", channel: "email",
  status: "queued", scheduled_for: null, dispatched_at: null,
  recipient_summary: "Atlas + 11 leads", audience_count: 12, result_note: null,
  updated_at: "2026-06-05T12:00:00Z",
  payload: { to: "atlas@example.com", subject: "Welcome", text: "Hello Atlas" },
};

describe("rowToDispatchView", () => {
  it("maps a row to a view, resolving the campaign + deliverable names", () => {
    const view = rowToDispatchView(row, { campaignName: "Spring push", deliverable: "Welcome email" });
    expect(view).toMatchObject({
      id: "d1", campaignId: "c1", campaignName: "Spring push",
      deliverable: "Welcome email", channel: "Email", status: "queued",
      recipientSummary: "Atlas + 11 leads", audienceCount: 12,
      preview: { to: "atlas@example.com", subject: "Welcome", text: "Hello Atlas" },
    });
  });

  it("falls back to a generic deliverable label when none is resolved", () => {
    const view = rowToDispatchView(row, { campaignName: "Spring push", deliverable: null });
    expect(view.deliverable).toBe("Deliverable");
  });
});
