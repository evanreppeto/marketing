import { describe, expect, it } from "vitest";

import { parseHermesSocialAdRequest } from "./social-ad-contract";

const base = {
  workflow: "social_ad",
  name: "Storm Damage Safety",
  persona: "persona_homeowner_emergency",
  restorationFocus: "storm_surge",
  headline: "Tree on the roof?",
  operator: "Mark",
};

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("parseHermesSocialAdRequest", () => {
  it("accepts a request with multiple image assets (base64)", () => {
    const req = parseHermesSocialAdRequest({
      ...base,
      assets: [
        { imageBase64: PNG_B64, format: "feed_1080x1080" },
        { imageBase64: PNG_B64, format: "story_1080x1920" },
      ],
    });
    expect(req.assets).toHaveLength(2);
    expect(req.assets[0].format).toBe("feed_1080x1080");
  });

  it("rejects an empty assets array", () => {
    expect(() => parseHermesSocialAdRequest({ ...base, assets: [] })).toThrow();
  });

  it("rejects an asset missing imageBase64", () => {
    expect(() => parseHermesSocialAdRequest({ ...base, assets: [{ format: "feed_1080x1080" }] })).toThrow();
  });

  it("rejects an invalid persona", () => {
    expect(() =>
      parseHermesSocialAdRequest({ ...base, persona: "unassigned_persona", assets: [{ imageBase64: PNG_B64 }] }),
    ).toThrow();
  });
});
