import { createGeminiMediaProvider } from "./gemini";
import type { MediaProvider } from "./types";

export type { MediaProvider, GeneratedMedia, ImageGenInput } from "./types";

export type MediaModelPrefs = { imageModel?: string; videoModel?: string };

/** stored pref (if non-empty) -> env -> built-in default. Pure + testable. */
export function resolveModel(stored: string | undefined, env: string | undefined, fallback: string): string {
  return (stored && stored.trim()) || (env && env.trim()) || fallback;
}

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
