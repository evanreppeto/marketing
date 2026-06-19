import type { ArcRoute } from "./arc-chat";

/** An Arc "level" (Swift/Studio) bundles the LLM lane + the media model tier.
 *  Maps the level (route) to the image/video model it should generate with. */
export function levelMediaModels(route: ArcRoute): { image: string; video: string } {
  return route === "standard"
    ? { image: "gemini-3-pro-image", video: "veo-3.1-generate-preview" }
    : { image: "gemini-3.1-flash-image", video: "veo-3.1-fast-generate-preview" };
}
