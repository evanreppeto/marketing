import { describe, expect, it } from "vitest";

import type { MarkActionCard } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

import { collectAssets } from "./asset-collect";

function card(over: Partial<MarkActionCard> = {}): MarkActionCard {
  return { kind: "draft", title: "Draft", rows: [], flags: [], ...over };
}

function msg(over: Partial<MarkMessage> = {}): MarkMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "mark",
    body: "",
    status: "complete",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments: [],
    createdAt: "t",
    ...over,
  };
}

describe("collectAssets", () => {
  it("collects drafts and media cards, skips result cards without media", () => {
    const m = msg({
      actions: [
        card({ kind: "draft", title: "A" }),
        card({ kind: "result", title: "B" }), // no media -> skipped
        card({ kind: "result", title: "C", media: { kind: "image", url: "u" } }),
      ],
    });
    expect(collectAssets([m]).map((a) => a.card.title)).toEqual(["A", "C"]);
  });

  it("dedupes by asset id; the first occurrence (current chat) wins", () => {
    const current = msg({
      id: "cur",
      conversationId: "c1",
      actions: [card({ title: "Current", approval: { kind: "campaign", campaignId: "k", assetId: "a1" } })],
    });
    const sibling = msg({
      id: "sib",
      conversationId: "c2",
      actions: [card({ title: "Sibling", approval: { kind: "campaign", campaignId: "k", assetId: "a1" } })],
    });
    const assets = collectAssets([current, sibling]);
    expect(assets).toHaveLength(1);
    expect(assets[0].card.title).toBe("Current");
    expect(assets[0].conversationId).toBe("c1");
  });

  it("records each asset's originating conversation", () => {
    const sibling = msg({ id: "sib", conversationId: "c2", actions: [card({ title: "S" })] });
    expect(collectAssets([sibling])[0].conversationId).toBe("c2");
  });
});
