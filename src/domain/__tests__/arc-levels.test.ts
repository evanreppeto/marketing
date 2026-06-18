import { describe, expect, it } from "vitest";
import { levelMediaModels } from "../arc-levels";

describe("levelMediaModels", () => {
  it("Studio (standard) -> Imagen Ultra + Veo 3", () => {
    expect(levelMediaModels("standard")).toEqual({ image: "imagen-4.0-ultra-generate-001", video: "veo-3.0-generate-001" });
  });
  it("Swift (fast) -> Imagen 4 + Veo 2", () => {
    expect(levelMediaModels("fast")).toEqual({ image: "imagen-4.0-generate-001", video: "veo-2.0-generate-001" });
  });
});
