// Pure, deterministic per-workspace media generation config. No I/O.
//
// Layer 2 of model selection (see docs/MODEL-SELECTION.md): which Higgsfield model
// Arc generates with, per output category. "auto" = let Arc pick the recommended
// model for the category (resolveHiggsfieldModel handles that). An override is a
// real model id in the SAME category; anything else normalizes back to "auto".
//
// The stored shape is a JSON blob (workspace_media_config.config); parseMediaConfig
// is the single trusted boundary that turns unknown JSON into a valid MediaConfig.

import {
  HIGGSFIELD_CATEGORIES,
  type HiggsfieldModel,
  findHiggsfieldModel,
  resolveHiggsfieldModel,
} from "./higgsfield-models";

/** The categories Arc actively offers media selection for (image/video/audio) —
 *  the offered subset of HiggsfieldCategory, excluding not-yet-offered "3d". */
export type MediaCategory = (typeof HIGGSFIELD_CATEGORIES)[number];

/** Sentinel for "Arc picks the recommended model for this category". */
export const MEDIA_AUTO = "auto" as const;

/** Aspect ratios the media panel offers as a workspace default. */
export const MEDIA_ASPECTS = ["1:1", "4:5", "9:16", "16:9"] as const;
export type MediaAspect = (typeof MEDIA_ASPECTS)[number];

export type MediaConfig = {
  /** Per-category default model id, or MEDIA_AUTO. */
  defaults: Record<MediaCategory, string>;
  /** When true, Arc always auto-picks regardless of per-category overrides. */
  autoPick: boolean;
  /** Default output aspect ratio (per-platform overrides still apply downstream). */
  defaultAspect: MediaAspect;
  /** Enhance approved brand media rather than fabricating it. */
  preferRealMedia: boolean;
  /** Whether Arc may generate video at all. */
  allowVideo: boolean;
};

export const DEFAULT_MEDIA_CONFIG: MediaConfig = {
  defaults: { image: MEDIA_AUTO, video: MEDIA_AUTO, audio: MEDIA_AUTO },
  autoPick: true,
  defaultAspect: "4:5",
  preferRealMedia: true,
  allowVideo: true,
};

/** A per-category default is valid only if it's MEDIA_AUTO or a real model in that
 *  category. A wrong-category or unknown id normalizes to MEDIA_AUTO. */
function normalizeDefault(category: MediaCategory, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value === MEDIA_AUTO) return MEDIA_AUTO;
  const model = findHiggsfieldModel(value.trim());
  return model && model.category === category ? model.id : MEDIA_AUTO;
}

function normalizeAspect(value: unknown): MediaAspect {
  return (MEDIA_ASPECTS as readonly string[]).includes(value as string)
    ? (value as MediaAspect)
    : DEFAULT_MEDIA_CONFIG.defaultAspect;
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Turn arbitrary stored JSON into a valid MediaConfig — the trusted boundary.
 * Every field falls back to its default; per-category defaults are validated
 * against the live roster so a retired/misspelled id can never reach the runner.
 */
export function parseMediaConfig(raw: unknown): MediaConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaultsRaw = (obj.defaults && typeof obj.defaults === "object" ? obj.defaults : {}) as Record<string, unknown>;
  const defaults = {} as Record<MediaCategory, string>;
  for (const category of HIGGSFIELD_CATEGORIES) {
    defaults[category] = normalizeDefault(category, defaultsRaw[category]);
  }
  return {
    defaults,
    autoPick: normalizeBool(obj.autoPick, DEFAULT_MEDIA_CONFIG.autoPick),
    defaultAspect: normalizeAspect(obj.defaultAspect),
    preferRealMedia: normalizeBool(obj.preferRealMedia, DEFAULT_MEDIA_CONFIG.preferRealMedia),
    allowVideo: normalizeBool(obj.allowVideo, DEFAULT_MEDIA_CONFIG.allowVideo),
  };
}

/**
 * The model Arc should generate with for a category, given the workspace config.
 * autoPick forces the recommended model; otherwise the per-category override wins
 * (falling back to recommended when it's MEDIA_AUTO or invalid). Returns null only
 * if the category has no recommended model at all.
 */
export function effectiveMediaModel(config: MediaConfig, category: MediaCategory): HiggsfieldModel | null {
  if (config.autoPick) return resolveHiggsfieldModel(category, null);
  const override = config.defaults[category];
  return resolveHiggsfieldModel(category, override === MEDIA_AUTO ? null : override);
}

/** A resolved per-category default, ready for the runner to inject into Arc's
 *  context. `explicit` distinguishes an operator-locked model from an auto-pick. */
export type ResolvedMediaDefault = {
  id: string;
  label: string;
  provider: string;
  /** True when this is a deliberate operator override (autoPick off + a real pick). */
  explicit: boolean;
} | null;

/**
 * Resolve every offered category to a runner-ready default. Keeps all roster
 * knowledge in the app (the runner is a separate package and can't import
 * @/domain), so the media-config route returns this and the runner just injects it.
 */
export function resolveMediaDefaults(config: MediaConfig): Record<MediaCategory, ResolvedMediaDefault> {
  const out = {} as Record<MediaCategory, ResolvedMediaDefault>;
  for (const category of HIGGSFIELD_CATEGORIES) {
    const model = effectiveMediaModel(config, category);
    const explicit = !config.autoPick && config.defaults[category] !== MEDIA_AUTO;
    out[category] = model ? { id: model.id, label: model.label, provider: model.provider, explicit } : null;
  }
  return out;
}
