import { describe, expect, it, vi } from "vitest";
import { resolveRecallMemory } from "./recall";
import type { ArcClient } from "./arc-client";

describe("resolveRecallMemory", () => {
  it("returns the fetched memory list", async () => {
    const memory = [{ label: "Flood angle", summary: "use proof X", kind: "messaging_angle" }];
    const client = { apiPost: vi.fn(async () => ({ memory })) } as unknown as ArcClient;
    const out = await resolveRecallMemory(client, "flood?");
    expect(out).toEqual(memory);
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/brain/recall", { message: "flood?" });
  });

  it("returns [] when the fetch throws", async () => {
    const client = { apiPost: vi.fn(async () => { throw new Error("boom"); }) } as unknown as ArcClient;
    expect(await resolveRecallMemory(client, "x")).toEqual([]);
  });

  it("returns [] when memory is missing/not an array", async () => {
    const client = { apiPost: vi.fn(async () => ({})) } as unknown as ArcClient;
    expect(await resolveRecallMemory(client, "x")).toEqual([]);
  });
});
