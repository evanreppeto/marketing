import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { brandTools } from "./brand";

const noStep = vi.fn(async () => {});

type HandlerResult = { content: Array<{ type: string; text: string }> };

function toolsByName(client: ArcClient, collect: (c: ArcActionCard) => void) {
  const arr = brandTools(client, noStep, collect);
  return Object.fromEntries(arr.map((t) => [t.name, t]));
}

function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("brandTools", () => {
  it("analyze_website calls the analyze route and returns the signal text", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, title: "Acme", text: "We fix leaks" })),
    } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    const res = await callHandler(tools["analyze_website"], { url: "https://acme.com" });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/brand/analyze-website", { url: "https://acme.com" });
    expect(res.content[0].text).toContain("We fix leaks");
  });

  it("analyze_website returns a failure message when the route throws", async () => {
    const client = {
      apiPost: vi.fn(async () => { throw new Error("unreachable"); }),
    } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    const res = await callHandler(tools["analyze_website"], { url: "https://acme.com" });
    expect(res.content[0].text).toContain("failed");
  });

  it("propose_brand_profile writes a draft via apiPut and emits a review card", async () => {
    const client = {
      apiPut: vi.fn(async () => ({ ok: true, profile: { displayName: "Acme Co", status: "draft" } })),
    } as unknown as ArcClient;
    const cards: ArcActionCard[] = [];
    const tools = toolsByName(client, (c) => cards.push(c));
    const res = await callHandler(tools["propose_brand_profile"], {
      displayName: "Acme Co",
      services: ["repairs"],
      tone: "friendly",
    });
    expect(client.apiPut).toHaveBeenCalledWith(
      "/api/v1/arc/brand/profile",
      expect.objectContaining({ displayName: "Acme Co", services: ["repairs"] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("draft");
    expect(cards[0].href).toBe("/settings");
    expect(res.content[0].text).toContain("draft");
  });

  it("propose_brand_profile emits no card when apiPut throws", async () => {
    const client = {
      apiPut: vi.fn(async () => { throw new Error("server error"); }),
    } as unknown as ArcClient;
    const cards: ArcActionCard[] = [];
    const tools = toolsByName(client, (c) => cards.push(c));
    const res = await callHandler(tools["propose_brand_profile"], { displayName: "Acme Co" });
    expect(cards).toHaveLength(0);
    expect(res.content[0].text).toContain("failed");
  });

  it("analyze_brand_design posts to the design route and returns the proposal text", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, logoUrl: "https://acme.com/logo.png", palette: { primary: "#c8a24b" } })),
    } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    const res = await callHandler(tools["analyze_brand_design"], { url: "https://acme.com" });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/brand/design", { url: "https://acme.com" });
    expect(res.content[0].text).toContain("#c8a24b");
  });

  it("propose_brand_profile forwards brandPalette and fonts", async () => {
    const client = {
      apiPut: vi.fn(async () => ({ ok: true, profile: { displayName: "Acme Co", status: "draft" } })),
    } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    await callHandler(tools["propose_brand_profile"], {
      displayName: "Acme Co",
      brandPalette: { primary: "#c8a24b", secondary: "#1b2a4a" },
      headingFont: "Oswald",
      bodyFont: "Inter",
    });
    expect(client.apiPut).toHaveBeenCalledWith(
      "/api/v1/arc/brand/profile",
      expect.objectContaining({
        displayName: "Acme Co",
        brandPalette: { primary: "#c8a24b", secondary: "#1b2a4a" },
        headingFont: "Oswald",
        bodyFont: "Inter",
      }),
    );
  });
});
