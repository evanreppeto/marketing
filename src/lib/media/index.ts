import { createGeminiMediaProvider } from "./gemini";
import type { MediaProvider } from "./types";

export type { MediaProvider, GeneratedMedia, ImageGenInput } from "./types";
// Re-export the model resolver from the provider (the shipping seam) so it's
// importable from @/lib/media and its unit test covers the real code path.
export { resolveModel } from "./gemini";

export type MediaModelPrefs = { imageModel?: string; videoModel?: string };

/** Master flag: media generation is on only when explicitly enabled AND credentialed. */
export function isMediaGenEnabled(): boolean {
  return process.env.ARC_MEDIA_ENABLED === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** The active provider, or null when disabled/uncredentialed (graceful off). */
export function getMediaProvider(prefs?: MediaModelPrefs): MediaProvider | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (process.env.ARC_MEDIA_ENABLED !== "1" || !key) return null;
  // Pass only non-empty prefs; the provider falls back to env/default for the rest.
  return createGeminiMediaProvider(key, {
    imageModel: prefs?.imageModel?.trim() || undefined,
    videoModel: prefs?.videoModel?.trim() || undefined,
  });
}
