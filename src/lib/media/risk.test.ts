import { describe, expect, it } from "vitest";

import { deriveImageRiskFlags } from "./risk";

describe("deriveImageRiskFlags", () => {
  it("flags claim risk for before/after & proof language", () => {
    expect(deriveImageRiskFlags("before and after proof of a guaranteed restoration")).toContain("claim risk");
  });
  it("flags privacy for people/homeowner refs", () => {
    expect(deriveImageRiskFlags("a happy homeowner family outside their house")).toContain("privacy/redaction");
  });
  it("flags embedded text for headline/logo refs", () => {
    expect(deriveImageRiskFlags("poster with a bold headline and our logo")).toContain("embedded text");
  });
  it("flags unrealistic scene for damage/disaster refs", () => {
    expect(deriveImageRiskFlags("a flooded basement with severe water damage")).toContain("unrealistic scene");
  });
  it("returns no flags for a neutral concept", () => {
    expect(deriveImageRiskFlags("an abstract blue gradient background")).toEqual([]);
  });
});
