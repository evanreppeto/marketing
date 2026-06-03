import { describe, expect, it } from "vitest";

import { assetDecisionStatus } from "../status-tone";

describe("assetDecisionStatus", () => {
  it("uses the gating approval's status when an approval exists", () => {
    expect(assetDecisionStatus({ approval: { id: "a1", status: "Approved" } })).toEqual({
      label: "Approved",
      tone: "green",
    });
    expect(assetDecisionStatus({ approval: { id: "a2", status: "Pending approval" } })).toEqual({
      label: "Pending approval",
      tone: "amber",
    });
  });

  it("falls back to Draft (no pending decision) when there is no approval", () => {
    expect(assetDecisionStatus({ approval: null })).toEqual({ label: "Draft", tone: "gray" });
  });
});
