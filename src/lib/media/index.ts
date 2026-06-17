import { createGeminiMediaProvider } from "./gemini";
import type { MediaProvider } from "./types";

export type { MediaProvider, GeneratedMedia, ImageGenInput } from "./types";

/** Master flag: media generation is on only when explicitly enabled AND credentialed. */
export function isMediaGenEnabled(): boolean {
  return process.env.ARC_MEDIA_ENABLED === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** The active provider, or null when disabled/uncredentialed (graceful off). */
export function getMediaProvider(): MediaProvider | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (process.env.ARC_MEDIA_ENABLED !== "1" || !key) return null;
  return createGeminiMediaProvider(key);
}
