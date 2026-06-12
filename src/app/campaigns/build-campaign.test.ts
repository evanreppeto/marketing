import { describe, expect, it } from "vitest";
import { parseBuildPrompt, deriveCampaignName } from "./build-campaign";

describe("parseBuildPrompt", () => {
  it("trims and rejects empty prompts", () => {
    expect(() => parseBuildPrompt("   ")).toThrow();
    expect(parseBuildPrompt("  storm response for landlords ")).toBe("storm response for landlords");
  });
  it("caps the length", () => {
    expect(() => parseBuildPrompt("x".repeat(2001))).toThrow();
  });
});

describe("deriveCampaignName", () => {
  it("titleizes the first clause into a name", () => {
    expect(deriveCampaignName("storm response for flood-zone landlords")).toBe("Storm Response For Flood-Zone Landlords");
  });
  it("truncates long prompts", () => {
    expect(deriveCampaignName("a".repeat(80)).length).toBeLessThanOrEqual(60);
  });
});
