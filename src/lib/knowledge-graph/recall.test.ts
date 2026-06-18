import { describe, expect, it, vi } from "vitest";

vi.mock("./read-model", () => ({ listNodes: vi.fn() }));

import { listNodes } from "./read-model";
import { getRecallMemory } from "./recall";

const listMock = vi.mocked(listNodes);

function node(id: string, label: string, trustTier: string) {
  return {
    id, kind: "learning", label, body: null, summary: null, persona: null,
    trustTier, confidence: null, refTable: null, refId: null, source: null,
    tags: [], createdBy: null, createdAt: null,
  };
}

describe("getRecallMemory", () => {
  it("queries trusted and observed tiers and ranks them (trusted first)", async () => {
    listMock.mockImplementation(async (filters) => {
      if (filters?.trustTier === "trusted") return { status: "live", nodes: [node("t1", "Trusted fact", "trusted")] } as never;
      if (filters?.trustTier === "observed") return { status: "live", nodes: [node("o1", "Observed learning", "observed")] } as never;
      return { status: "live", nodes: [] } as never;
    });
    const out = await getRecallMemory("org_1", "");
    expect(listMock).toHaveBeenCalledWith({ trustTier: "trusted" }, undefined, "org_1");
    expect(listMock).toHaveBeenCalledWith({ trustTier: "observed" }, undefined, "org_1");
    expect(out.map((r) => r.label)).toEqual(["Trusted fact", "Observed learning"]);
  });

  it("never queries proposed/rejected/archived tiers", async () => {
    listMock.mockResolvedValue({ status: "live", nodes: [] } as never);
    await getRecallMemory("org_1", "hello");
    const tiers = listMock.mock.calls.map((c) => c[0]?.trustTier);
    expect(tiers).toEqual(expect.arrayContaining(["trusted", "observed"]));
    expect(tiers).not.toContain("proposed");
    expect(tiers).not.toContain("rejected");
    expect(tiers).not.toContain("archived");
  });

  it("returns [] when a tier read is unavailable", async () => {
    listMock.mockResolvedValue({ status: "unavailable", message: "down" } as never);
    expect(await getRecallMemory("org_1", "x")).toEqual([]);
  });
});
