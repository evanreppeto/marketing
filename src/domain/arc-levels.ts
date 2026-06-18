import type { ArcRoute } from "./arc-chat";

/** An Arc "level" (Swift/Studio) bundles the LLM lane + the media model tier.
 *  Maps the level (route) to the image/video model it should generate with. */
export function levelMediaModels(route: ArcRoute): { image: string; video: string } {
  return route === "standard"
    ? { image: "imagen-4.0-ultra-generate-001", video: "veo-3.0-generate-001" }
    : { image: "imagen-4.0-generate-001", video: "veo-2.0-generate-001" };
}
