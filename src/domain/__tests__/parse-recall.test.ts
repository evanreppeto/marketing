import { describe, expect, it } from "vitest";

import { parseRecall } from "@/domain";

describe("parseRecall", () => {
  it("parses well-formed items", () => {
    const out = parseRecall([
      { label: "Landlord playbook", confidence: 0.9, kind: "note", nodeId: "n1" },
      { label: "Storm email won 31%", confidence: 0.7 },
    ]);
    expect(out).toEqual([
      { label: "Landlord playbook", confidence: 0.9, kind: "note", nodeId: "n1" },
      { label: "Storm email won 31%", confidence: 0.7 },
    ]);
  });

  it("drops items without a label and never throws", () => {
    expect(parseRecall([{ confidence: 0.5 }, "junk", null, 42])).toEqual([]);
  });

  it("clamps confidence to [0,1] and drops non-numeric", () => {
    expect(parseRecall([{ label: "A", confidence: 5 }])[0].confidence).toBe(1);
    expect(parseRecall([{ label: "B", confidence: -2 }])[0].confidence).toBe(0);
    expect(parseRecall([{ label: "C", confidence: "x" }])[0].confidence).toBeUndefined();
  });

  it("returns [] for non-arrays", () => {
    expect(parseRecall(undefined)).toEqual([]);
    expect(parseRecall({})).toEqual([]);
  });

  it("caps to 8 items", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `n${i}` }));
    expect(parseRecall(many)).toHaveLength(8);
  });
});
