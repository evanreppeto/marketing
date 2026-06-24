import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { approvalReadTools, approvalWriteTools } from "./approvals";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };

function byName(tools: Array<{ name: string; handler: unknown }>): Record<string, { handler: unknown }> {
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("approval tools", () => {
  it("get_approval fetches one approval item by id", async () => {
    const client = {
      apiGet: vi.fn(async () => ({ ok: true, approval: { id: "ap1", status: "pending_approval" } })),
    } as unknown as ArcClient;
    const tools = byName(approvalReadTools(client, noStep));
    const res = await callHandler(tools["get_approval"], { id: "ap1" });
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/approvals/ap1");
    expect(res.content[0].text).toContain("ap1");
  });

  it("recommend_on_approval posts an advisory recommendation to the right item", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, status: "recorded", recommendationId: "r1" })),
    } as unknown as ArcClient;
    const tools = byName(approvalWriteTools(client, noStep));
    const res = await callHandler(tools["recommend_on_approval"], {
      approval_id: "ap1",
      recommendation: "approve",
      rationale: "strong, real proof attached",
      risk_flags: ["claim_risk"],
      suggested_edits: "tighten the CTA",
    });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/approvals/ap1/recommendation", {
      recommendation: "approve",
      rationale: "strong, real proof attached",
      risk_flags: ["claim_risk"],
      suggested_edits: "tighten the CTA",
    });
    expect(res.content[0].text).toContain("r1");
  });

  it("recommend_on_approval omits optional fields when not provided", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, recommendationId: "r2" })),
    } as unknown as ArcClient;
    const tools = byName(approvalWriteTools(client, noStep));
    await callHandler(tools["recommend_on_approval"], { approval_id: "ap2", recommendation: "request revision" });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/approvals/ap2/recommendation", {
      recommendation: "request revision",
    });
  });

  it("exposes get_approval (read) and recommend_on_approval (write)", () => {
    expect(approvalReadTools({} as ArcClient, noStep).map((t) => t.name)).toEqual(["get_approval"]);
    expect(approvalWriteTools({} as ArcClient, noStep).map((t) => t.name)).toEqual(["recommend_on_approval"]);
  });
});
