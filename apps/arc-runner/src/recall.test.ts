import { describe, expect, it, vi } from "vitest";
import { buildRecallQuery, resolveRecallMemory } from "./recall";
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

describe("buildRecallQuery", () => {
  it("returns the message alone when there is no history", () => {
    expect(buildRecallQuery(undefined, "flood?")).toBe("flood?");
    expect(buildRecallQuery([], "flood?")).toBe("flood?");
  });

  it("folds the recent turns in before the current message", () => {
    const out = buildRecallQuery(
      [
        { role: "operator", body: "tell me about the Lincoln Park lead" },
        { role: "arc", body: "It's an emergency homeowner, water damage." },
      ],
      "draft a follow-up",
    );
    expect(out).toContain("Lincoln Park");
    expect(out).toContain("water damage");
    expect(out).toContain("draft a follow-up");
    expect(out.indexOf("Lincoln Park")).toBeLessThan(out.indexOf("draft a follow-up"));
  });

  it("keeps only the last few turns", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ role: "operator" as const, body: `turn-${i}` }));
    const out = buildRecallQuery(many, "now");
    expect(out).not.toContain("turn-0");
    expect(out).toContain("turn-9");
    expect(out).toContain("now");
  });
});
