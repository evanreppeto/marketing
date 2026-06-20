import { describe, expect, it } from "vitest";

import { pickInitialNodeId } from "../initial-node";

type N = { id: string; kind: string; label: string; persona: string | null };

const nodes: N[] = [
  { id: "hub-1", kind: "hub", label: "Arc", persona: null },
  { id: "flag-1", kind: "campaign", label: "Emergency Water Loss", persona: null },
  { id: "p-1", kind: "persona", label: "Emergency homeowner", persona: "persona_homeowner_emergency" },
  { id: "p-2", kind: "persona", label: "Landlord", persona: "persona_landlord" },
];

describe("pickInitialNodeId", () => {
  it("selects the node whose persona matches the requested slug", () => {
    expect(pickInitialNodeId(nodes, { persona: "homeowner-emergency", hubId: "hub-1" })).toBe("p-1");
  });

  it("matches a persona slug with underscores or persona_ prefix", () => {
    expect(pickInitialNodeId(nodes, { persona: "landlord", hubId: "hub-1" })).toBe("p-2");
  });

  it("falls back to the flagship campaign node when no persona is requested", () => {
    expect(pickInitialNodeId(nodes, { persona: undefined, hubId: "hub-1" })).toBe("flag-1");
  });

  it("falls back to the hub when there is no flagship and no persona match", () => {
    const plain: N[] = [{ id: "hub-1", kind: "hub", label: "Arc", persona: null }];
    expect(pickInitialNodeId(plain, { persona: "nope", hubId: "hub-1" })).toBe("hub-1");
  });

  it("returns null for an empty node list", () => {
    expect(pickInitialNodeId([], { persona: undefined, hubId: null })).toBeNull();
  });
});
