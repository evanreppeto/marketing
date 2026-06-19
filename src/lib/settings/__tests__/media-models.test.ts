import { describe, expect, it } from "vitest";

import { IMAGE_MODELS, VIDEO_MODELS, appImageModel, appVideoModel } from "../store";

describe("appImageModel", () => {
  it("returns each allow-listed image id unchanged", () => {
    for (const id of IMAGE_MODELS) {
      expect(appImageModel(id)).toBe(id);
    }
  });

  it('treats "" as Auto', () => {
    expect(appImageModel("")).toBe("");
  });

  it("rejects junk values to Auto", () => {
    expect(appImageModel("foo")).toBe("");
    expect(appImageModel(42)).toBe("");
    expect(appImageModel(null)).toBe("");
    expect(appImageModel(undefined)).toBe("");
    expect(appImageModel("  ")).toBe("");
  });

  it("rejects a video id (cross-list rejection)", () => {
    expect(appImageModel("veo-3.1-generate-preview")).toBe("");
  });
});

describe("appVideoModel", () => {
  it("returns each allow-listed video id unchanged", () => {
    for (const id of VIDEO_MODELS) {
      expect(appVideoModel(id)).toBe(id);
    }
  });

  it('treats "" as Auto', () => {
    expect(appVideoModel("")).toBe("");
  });

  it("rejects junk values to Auto", () => {
    expect(appVideoModel("foo")).toBe("");
    expect(appVideoModel(42)).toBe("");
    expect(appVideoModel(null)).toBe("");
    expect(appVideoModel(undefined)).toBe("");
    expect(appVideoModel("  ")).toBe("");
  });

  it("rejects an image id (cross-list rejection)", () => {
    expect(appVideoModel("gemini-3-pro-image")).toBe("");
  });
});
