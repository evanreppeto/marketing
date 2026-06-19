import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { intelligenceTools } from "./intelligence";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };

function byName(client: ArcClient) {
  return Object.fromEntries(intelligenceTools(client, noStep).map((t) => [t.name, t]));
}

function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("intelligenceTools", () => {
  it("list_opportunities calls the opportunities route", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, opportunities: [{ id: "o1" }] })) } as unknown as ArcClient;
    const tools = byName(client);
    const res = await callHandler(tools["list_opportunities"], {});
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/opportunities");
    expect(res.content[0].text).toContain("o1");
  });
  it("get_vault_note passes the slug", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, note: { slug: "n1" } })) } as unknown as ArcClient;
    const tools = byName(client);
    await callHandler(tools["get_vault_note"], { slug: "n1" });
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/vault", { slug: "n1" });
  });
  it("exposes all five tools", () => {
    const names = intelligenceTools({} as ArcClient, noStep).map((t) => t.name).sort();
    expect(names).toEqual(["get_vault_note", "list_opportunities", "list_vault_notes", "read_persona_intelligence", "read_recent_activity"]);
  });
});
