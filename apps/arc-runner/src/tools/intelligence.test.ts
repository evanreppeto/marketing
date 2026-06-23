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
  it("list_brand_documents calls the brand sources route", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, documents: [{ id: "a1" }] })) } as unknown as ArcClient;
    const tools = byName(client);
    const res = await callHandler(tools["list_brand_documents"], {});
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/brand/sources");
    expect(res.content[0].text).toContain("a1");
  });
  it("read_brand_document passes the id", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, document: { id: "a1" } })) } as unknown as ArcClient;
    const tools = byName(client);
    await callHandler(tools["read_brand_document"], { id: "a1" });
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/brand/sources", { id: "a1" });
  });
  it("research_web posts a Gemini web-search request", async () => {
    const client = { apiPost: vi.fn(async () => ({ ok: true, research: { text: "Found sources" } })) } as unknown as ArcClient;
    const tools = byName(client);
    const res = await callHandler(tools["research_web"], { query: "Find property managers in Chicago", context: "BSR leads" });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/research/web-search", {
      query: "Find property managers in Chicago",
      context: "BSR leads",
    });
    expect(res.content[0].text).toContain("Found sources");
  });
  it("exposes all eight tools", () => {
    const names = intelligenceTools({} as ArcClient, noStep).map((t) => t.name).sort();
    expect(names).toEqual([
      "get_vault_note",
      "list_brand_documents",
      "list_opportunities",
      "list_vault_notes",
      "read_brand_document",
      "read_persona_intelligence",
      "read_recent_activity",
      "research_web",
    ]);
  });
});
