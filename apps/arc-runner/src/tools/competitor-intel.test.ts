import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { competitorIntelTool } from "./competitor-intel";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };

function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("record_competitor_intel", () => {
  it("posts the finding to the competitor-intel route, mapping to the domain's camelCase shape", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, status: "needs_review", result: { competitorCampaignId: "cc1" } })),
    } as unknown as ArcClient;
    const res = await callHandler(competitorIntelTool(client, noStep), {
      source: "meta_ad_library",
      competitor_name: "ServproX",
      competitor_url: "https://serprox.example",
      summary: "Running flood-restoration ads in Chicago",
      channel_mix: { meta: 0.7, google: 0.3 },
      top_keywords: ["water damage", "flood cleanup"],
      persona: "persona_homeowner_emergency",
    });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/competitor-intel", {
      source: "meta_ad_library",
      competitorName: "ServproX",
      competitorUrl: "https://serprox.example",
      summary: "Running flood-restoration ads in Chicago",
      channelMix: { meta: 0.7, google: 0.3 },
      topKeywords: ["water damage", "flood cleanup"],
      persona: "persona_homeowner_emergency",
    });
    expect(res.content[0].text).toContain("cc1");
  });

  it("omits optional fields that aren't provided", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, result: { competitorCampaignId: "cc2" } })),
    } as unknown as ArcClient;
    await callHandler(competitorIntelTool(client, noStep), { source: "landing_page", competitor_name: "Acme Restoration" });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/competitor-intel", {
      source: "landing_page",
      competitorName: "Acme Restoration",
    });
  });

  it("is named record_competitor_intel", () => {
    expect(competitorIntelTool({} as ArcClient, noStep).name).toBe("record_competitor_intel");
  });
});
