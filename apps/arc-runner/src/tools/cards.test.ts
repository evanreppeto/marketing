import { describe, expect, it } from "vitest";

import type { ArcActionCard } from "../types";
import { emitCardTool } from "./cards";

type HandlerResult = { content: Array<{ type: string; text: string }> };

function collectorAndTool() {
  const cards: ArcActionCard[] = [];
  const tool = emitCardTool((c) => cards.push(c));
  // The SDK types the handler's args as all-keys-required; in tests we invoke it
  // with partial inputs (as the model would), so call through a loose wrapper.
  const call = (args: Record<string, unknown>): Promise<HandlerResult> =>
    (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
  return { cards, tool, call };
}

describe("emit_card", () => {
  it("is named emit_card", () => {
    const { tool } = collectorAndTool();
    expect(tool.name).toBe("emit_card");
  });

  it("collects a result card, defaulting rows/flags to []", async () => {
    const { cards, call } = collectorAndTool();
    const out = await call({ kind: "result", title: "3 leads found" });
    expect(cards).toEqual<ArcActionCard[]>([
      { kind: "result", title: "3 leads found", rows: [], flags: [] },
    ]);
    expect(out.content[0].text).toContain("3 leads found");
  });

  it("collects a draft card with rows, flags, preview, and an approval block", async () => {
    const { cards, call } = collectorAndTool();
    await call({
      kind: "draft",
      title: "Fall ad",
      preview: "Before winter…",
      rows: [{ name: "Headline", meta: "28 chars" }],
      flags: [{ tone: "ok", label: "brand safe" }],
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
    expect(cards[0]).toEqual<ArcActionCard>({
      kind: "draft",
      title: "Fall ad",
      preview: "Before winter…",
      rows: [{ name: "Headline", meta: "28 chars" }],
      flags: [{ tone: "ok", label: "brand safe" }],
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
  });

  it("passes through a media block", async () => {
    const { cards, call } = collectorAndTool();
    await call({
      kind: "draft",
      title: "Real proof",
      media: { kind: "image", url: "https://x/y.jpg", source: "bsr_real", format: "1:1" },
    });
    expect(cards[0].media).toEqual({ kind: "image", url: "https://x/y.jpg", source: "bsr_real", format: "1:1" });
  });

  it("collects a navigate card with appState", async () => {
    const collected: ArcActionCard[] = [];
    const tool = emitCardTool((c) => collected.push(c));
    const call = (args: Record<string, unknown>): Promise<HandlerResult> =>
      (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
    await call({
      kind: "navigate",
      title: "Open the 3 matching leads in CRM",
      appState: { href: "/crm/leads?persona=landlord", filters: ["persona: landlord"] },
    });
    expect(collected[0]).toMatchObject({
      kind: "navigate",
      title: "Open the 3 matching leads in CRM",
      appState: { href: "/crm/leads?persona=landlord", filters: ["persona: landlord"] },
    });
  });
});
