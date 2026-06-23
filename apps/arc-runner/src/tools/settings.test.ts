import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { settingsReadTools } from "./settings";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };
function byName(client: ArcClient) {
  return Object.fromEntries(settingsReadTools(client, noStep).map((t) => [t.name, t]));
}
function callHandler(t: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (t.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("settingsReadTools", () => {
  it("get_workspace_settings requests the full workspace detail", async () => {
    const client = {
      apiGet: vi.fn(async () => ({ ok: true, workspace: { brandKit: "active", connectorList: [] } })),
    } as unknown as ArcClient;
    const tools = byName(client);
    const res = await callHandler(tools["get_workspace_settings"], {});
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/workspace", { detail: "full" });
    expect(res.content[0].text).toContain("active");
  });
});
