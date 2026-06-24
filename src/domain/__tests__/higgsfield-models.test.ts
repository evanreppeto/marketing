import { describe, it, expect } from "vitest";

import {
  HIGGSFIELD_MODELS,
  HIGGSFIELD_CATEGORIES,
  higgsfieldModelsByCategory,
  findHiggsfieldModel,
  defaultHiggsfieldModel,
  type HiggsfieldCategory,
} from "../higgsfield-models";

describe("Higgsfield model roster", () => {
  it("every model has a non-empty id, label, provider, and valid category; ids are unique", () => {
    const validCats = new Set<HiggsfieldCategory>(["image", "video", "audio", "3d"]);
    const ids = new Set<string>();
    for (const m of HIGGSFIELD_MODELS) {
      expect(m.id.trim().length).toBeGreaterThan(0);
      expect(m.label.trim().length).toBeGreaterThan(0);
      expect(m.provider.trim().length).toBeGreaterThan(0);
      expect(validCats.has(m.category)).toBe(true);
      expect(ids.has(m.id)).toBe(false); // no duplicate ids
      ids.add(m.id);
    }
  });

  it("actively offers the image, video, and audio categories, each with models", () => {
    expect(HIGGSFIELD_CATEGORIES).toEqual(["image", "video", "audio"]);
    for (const c of HIGGSFIELD_CATEGORIES) {
      expect(higgsfieldModelsByCategory(c).length).toBeGreaterThan(0);
    }
  });

  it("higgsfieldModelsByCategory returns only models of that category, with the expected members", () => {
    const videos = higgsfieldModelsByCategory("video");
    expect(videos.every((m) => m.category === "video")).toBe(true);
    const ids = videos.map((m) => m.id);
    expect(ids).toContain("marketing_studio_video");
    expect(ids).toContain("veo3_1");
    expect(ids).toContain("kling3_0");
  });

  it("findHiggsfieldModel resolves a known id and returns null for an unknown one", () => {
    expect(findHiggsfieldModel("marketing_studio_image")?.category).toBe("image");
    expect(findHiggsfieldModel("not_a_real_model")).toBeNull();
  });

  it("each offered category has exactly one Arc-recommended default that defaultHiggsfieldModel returns", () => {
    for (const c of HIGGSFIELD_CATEGORIES) {
      const recommended = higgsfieldModelsByCategory(c).filter((m) => m.recommended);
      expect(recommended).toHaveLength(1); // Arc's single auto-pick per category
      const def = defaultHiggsfieldModel(c);
      expect(def?.recommended).toBe(true);
      expect(def?.category).toBe(c);
    }
  });

  it("auto-picks purpose-built marketing models as the image and video defaults", () => {
    expect(defaultHiggsfieldModel("image")?.id).toBe("marketing_studio_image");
    expect(defaultHiggsfieldModel("video")?.id).toBe("marketing_studio_video");
  });
});
