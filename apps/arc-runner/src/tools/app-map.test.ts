import { describe, expect, it } from "vitest";
import type { ArcClient } from "../arc-client";
import { appMapTools } from "./app-map";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };
function callHandler(t: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (t.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("appMapTools", () => {
  it("get_app_map returns the surfaces with routes", async () => {
    const [getAppMap] = appMapTools({} as ArcClient, noStep);
    expect(getAppMap.name).toBe("get_app_map");
    const res = await callHandler(getAppMap as unknown as { handler: unknown }, {});
    expect(res.content[0].text).toContain("/settings");
    expect(res.content[0].text).toContain("CRM");
  });
});
