import { levelMediaModels, type ArcRoute } from "@/domain";

import { createGeminiMediaProvider } from "./gemini";
import type { MediaProvider } from "./types";

export type { MediaProvider, GeneratedMedia, ImageGenInput } from "./types";
// Re-export the model resolver from the provider (the shipping seam) so it's
// importable from @/lib/media and its unit test covers the real code path.
export { resolveModel } from "./gemini";

export type MediaModelPrefs = { level?: ArcRoute; imageModel?: string; videoModel?: string };

/**
 * GLOBAL master flag: the shared, env-configured media credential is on. This is
 * the deployment-level switch (used by the operator self-test / diagnose). For a
 * per-workspace decision — a tenant that brought its own Gemini key — use
 * `resolveWorkspaceMediaAccess` from `@/lib/media/access`.
 */
export function isMediaGenEnabled(): boolean {
  return process.env.ARC_MEDIA_ENABLED === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Build the media provider from an explicit API key (resolved per-workspace or
 * from env by the caller). Returns null when no key is available (graceful off).
 */
export function getMediaProvider(apiKey: string | null, prefs?: MediaModelPrefs): MediaProvider | null {
  const key = apiKey?.trim();
  if (!key) return null;
  const level = prefs?.level ? levelMediaModels(prefs.level) : undefined;
  // Precedence: explicit Advanced override -> level mapping -> (env/default,
  // handled inside the provider's resolveModel). Pass only resolved values;
  // undefined lets the provider fall through to env/built-in default.
  return createGeminiMediaProvider(key, {
    imageModel: (prefs?.imageModel?.trim() || level?.image) || undefined,
    videoModel: (prefs?.videoModel?.trim() || level?.video) || undefined,
  });
}
