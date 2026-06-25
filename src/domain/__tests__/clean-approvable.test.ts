import { describe, expect, it } from "vitest";

import { cleanApprovableDrafts, type ArcActionCard } from "@/domain";

const draft = (over: Partial<ArcActionCard> = {}): ArcActionCard => ({
  kind: "draft",
  title: "Email",
  rows: [],
  flags: [],
  approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
  ...over,
});

describe("cleanApprovableDrafts", () => {
  it("returns approval ids for flagless, undecided drafts with an approval block", () => {
    expect(cleanApprovableDrafts([draft({ approval: { kind: "campaign", campaignId: "c1", assetId: "a1" } })])).toEqual([
      { campaignId: "c1", assetId: "a1" },
    ]);
  });

  it("excludes drafts with a warn or risk flag", () => {
    expect(cleanApprovableDrafts([draft({ flags: [{ tone: "risk", label: "claim risk" }] })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ flags: [{ tone: "warn", label: "check" }] })])).toEqual([]);
  });

  it("excludes already-decided drafts", () => {
    expect(cleanApprovableDrafts([draft({ status: "approved" })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ status: "revision" })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ status: "rejected" })])).toEqual([]);
  });

  it("excludes cards without an approval block or that aren't drafts", () => {
    expect(cleanApprovableDrafts([draft({ approval: undefined })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ kind: "result" })])).toEqual([]);
  });
});
