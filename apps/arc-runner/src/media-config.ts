import type { ArcClient } from "./arc-client";
import type { ArcMode } from "./tools";

/** One resolved per-category default (mirrors the app's ResolvedMediaDefault). */
export type ResolvedMediaDefault = {
  id: string;
  label: string;
  provider: string;
  /** True when the operator deliberately locked this model (not an auto-pick). */
  explicit: boolean;
} | null;

/** The runner-facing media config: resolved per-category defaults + the toggles.
 *  Shaped to match GET /api/v1/arc/media-config; the roster resolution is done
 *  app-side so the runner just injects the result. */
export type ArcMediaConfig = {
  defaults: { image: ResolvedMediaDefault; video: ResolvedMediaDefault; audio: ResolvedMediaDefault };
  autoPick: boolean;
  allowVideo: boolean;
  preferRealMedia: boolean;
  defaultAspect: string;
};

/** Media config only steers work modes (draft/act) — ask/scan never generate. */
export function mediaConfigAllowedForMode(mode: ArcMode): boolean {
  return mode === "draft" || mode === "act";
}

/** Fetch this workspace's media config via the app API. Best-effort: any failure
 *  (or an unconfigured backend) returns null, so Arc simply auto-picks — a media
 *  config fetch never breaks a turn. */
export async function fetchMediaConfig(client: ArcClient): Promise<ArcMediaConfig | null> {
  try {
    const res = await client.apiGet<{
      config?: { autoPick?: boolean; allowVideo?: boolean; preferRealMedia?: boolean; defaultAspect?: string };
      defaults?: ArcMediaConfig["defaults"];
    }>("/api/v1/arc/media-config");
    if (!res.config || !res.defaults) return null;
    return {
      defaults: res.defaults,
      autoPick: res.config.autoPick ?? true,
      allowVideo: res.config.allowVideo ?? true,
      preferRealMedia: res.config.preferRealMedia ?? true,
      defaultAspect: res.config.defaultAspect ?? "4:5",
    };
  } catch {
    return null;
  }
}
