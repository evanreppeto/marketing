import { describe, expect, it } from "vitest";

import { parseActions } from "../arc-chat";

describe("parseActions", () => {
  it("returns [] for non-arrays / garbage", () => {
    expect(parseActions(undefined)).toEqual([]);
    expect(parseActions(null)).toEqual([]);
    expect(parseActions("x")).toEqual([]);
    expect(parseActions([{ kind: "nope", title: "x" }])).toEqual([]);
    expect(parseActions([{ kind: "result" }])).toEqual([]); // missing title
  });

  it("parses a result card with rows", () => {
    const out = parseActions([
      {
        kind: "result",
        title: "3 leads added",
        href: "/crm/leads",
        rows: [
          { name: "Dana", meta: "Homeowner", badge: "92" },
          { name: "no-name-ignored" },
          { bad: true },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "result", title: "3 leads added", href: "/crm/leads" });
    expect(out[0].rows).toHaveLength(2);
    expect(out[0].flags).toEqual([]);
  });

  it("parses a draft card with preview, flags, and a campaign approval ref", () => {
    const out = parseActions([
      {
        kind: "draft",
        title: "Draft campaign",
        preview: "When the unexpected hits…",
        flags: [{ tone: "ok", label: "On-brand" }, { tone: "nope", label: "x" }],
        approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
      },
    ]);
    expect(out[0]).toMatchObject({ kind: "draft", title: "Draft campaign", preview: "When the unexpected hits…" });
    expect(out[0].flags).toEqual([{ tone: "ok", label: "On-brand" }]);
    expect(out[0].approval).toEqual({ kind: "campaign", campaignId: "c1", assetId: "a1" });
  });

  it("drops an approval ref missing ids", () => {
    const out = parseActions([{ kind: "draft", title: "d", approval: { kind: "campaign", campaignId: "c1" } }]);
    expect(out[0].approval).toBeUndefined();
  });
});
