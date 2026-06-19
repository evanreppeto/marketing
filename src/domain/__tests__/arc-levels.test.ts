import { describe, expect, it } from "vitest";
import { levelMediaModels } from "../arc-levels";

describe("levelMediaModels", () => {
  it("Studio (standard) -> Imagen Ultra + Veo 3", () => {
    expect(levelMediaModels("standard")).toEqual({ image: "gemini-3-pro-image", video: "veo-3.1-generate-preview" });
  });
  it("Swift (fast) -> Imagen 4 + Veo 2", () => {
    expect(levelMediaModels("fast")).toEqual({ image: "gemini-3.1-flash-image", video: "veo-3.1-fast-generate-preview" });
  });
});
