import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import { performanceReadTools } from "./performance";

function loose(tool: ReturnType<typeof performanceReadTools>[number]) {
  return (args: Record<string, unknown>) =>
    (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
}

describe("read_performance", () => {
  it("reads /api/v1/arc/performance and returns the slices in its text result", async () => {
    const apiGet = vi.fn(async () => ({
      ok: true,
      dimension: "persona",
      slices: [{ key: "persona_landlord", jobs: 4, roas: 4 }],
    }));
    const client = { apiGet } as unknown as ArcClient;
    const step = vi.fn(async () => {});

    const [readPerformance] = performanceReadTools(client, step);
    expect(readPerformance.name).toBe("read_performance");

    const res = await loose(readPerformance)({ dimension: "persona", days: 90 });

    // apiGet was called against the performance endpoint.
    expect(apiGet).toHaveBeenCalledWith(
      "/api/v1/arc/performance",
      expect.objectContaining({ dimension: "persona", days: 90 }),
    );

    // The slice data is stringified into the tool's text result.
    const text = res.content[0].text;
    expect(text).toContain("persona_landlord");
    expect(text).toContain("4");
  });

  it("falls back to an empty slices array when the endpoint returns none", async () => {
    const apiGet = vi.fn(async () => ({ ok: true, dimension: "channel" }));
    const client = { apiGet } as unknown as ArcClient;
    const step = vi.fn(async () => {});

    const [readPerformance] = performanceReadTools(client, step);
    const res = await loose(readPerformance)({ dimension: "channel" });

    expect(res.content[0].text).toContain('"slices":[]');
  });
});
