import { describe, expect, it, vi } from "vitest";

vi.mock("./graph", () => ({ getBrainGraph: vi.fn() }));

import { getBrainGraph } from "./graph";
import { getRecallMemory } from "./recall";

const graphMock = vi.mocked(getBrainGraph);

function node(id: string, label: string, trustTier: string, kind = "learning") {
  return {
    id, kind, label, body: null, summary: null, persona: null,
    trustTier, confidence: null, refTable: null, refId: null, source: null,
    tags: [], createdBy: null, createdAt: null,
  };
}

describe("getRecallMemory", () => {
  it("queries the graph for trusted+observed only", async () => {
    graphMock.mockResolvedValue({ status: "live", nodes: [], edges: [], truncated: false } as never);
    await getRecallMemory("org_1", "hi");
    expect(graphMock).toHaveBeenCalledWith({ trustTiers: ["trusted", "observed"] }, undefined, "org_1");
  });

  it("ranks trusted before observed and attaches related lines from edges", async () => {
    graphMock.mockResolvedValue({
      status: "live",
      nodes: [
        node("o1", "Observed learning", "observed"),
        node("t1", "Flood angle", "trusted", "messaging_angle"),
        node("p1", "24/7 response", "trusted", "proof_point"),
      ],
      edges: [{ id: "e1", fromNodeId: "t1", toNodeId: "p1", relation: "proves", weight: null, trustTier: "trusted" }],
      truncated: false,
    } as never);
    const out = await getRecallMemory("org_1", "");
    expect(out[0].label).toBe("Flood angle"); // trusted first
    const angle = out.find((i) => i.label === "Flood angle")!;
    expect(angle.related).toEqual(["—proves→ 24/7 response (proof_point)"]);
  });

  it("returns [] when the graph is unavailable", async () => {
    graphMock.mockResolvedValue({ status: "unavailable", message: "down" } as never);
    expect(await getRecallMemory("org_1", "x")).toEqual([]);
  });
});
