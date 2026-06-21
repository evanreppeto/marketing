import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { proposeOpportunityTool } from "./opportunities";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };

function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("proposeOpportunityTool", () => {
  it("posts the proposal to the propose route", async () => {
    const client = { apiPost: vi.fn(async () => ({ ok: true, created: 1 })) } as unknown as ArcClient;
    const t = proposeOpportunityTool(client, noStep);
    await callHandler(t, {
      kind: "reengagement",
      subject_type: "company",
      subject_id: "co_1",
      title: "t",
      summary: "s",
    });
    expect(client.apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/opportunities/propose",
      expect.objectContaining({ subject_id: "co_1" }),
    );
  });
});
