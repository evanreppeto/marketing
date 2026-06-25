import { describe, expect, it, vi, afterEach } from "vitest";
import { checkHiggsfieldToken } from "../higgsfield-health";

afterEach(() => vi.restoreAllMocks());

describe("checkHiggsfieldToken", () => {
  it("returns ok when balance comes back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      text: async () => 'data: {"result":{"structuredContent":{"credits":10,"subscription_plan_type":"ultra"}},"jsonrpc":"2.0","id":1}\n',
    })));
    const res = await checkHiggsfieldToken("oat_x");
    expect(res.ok).toBe(true);
  });

  it("returns not-ok on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, headers: new Headers(), text: async () => "unauthorized" })));
    const res = await checkHiggsfieldToken("oat_bad");
    expect(res.ok).toBe(false);
  });
});
