import { type SupabaseClient } from "@supabase/supabase-js";

import { readConnectorCredential } from "@/lib/connectors/credentials";
import { resolveConnectorCredentialRef } from "@/lib/connectors/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/** Where a workspace's media API key came from. */
export type MediaKeySource = "workspace" | "env" | "none";

export type MediaAccess = {
  /** True when media generation is available for this workspace. */
  enabled: boolean;
  /** The Gemini API key to generate with, or null when disabled. */
  apiKey: string | null;
  source: MediaKeySource;
};

const DISABLED: MediaAccess = { enabled: false, apiKey: null, source: "none" };

/**
 * Resolve this workspace's media-generation access.
 *
 * A workspace that has connected its own Gemini API key uses THAT key, on its own
 * Google billing/quota — regardless of the deployment's global flag. One Google AI
 * Studio key powers both grounded research and Imagen/Veo, so we reuse the
 * existing per-workspace `gemini-research` connector credential rather than asking
 * the operator to paste the same key twice.
 *
 * Otherwise it falls back to the shared env key, gated by the global
 * `ARC_MEDIA_ENABLED` master switch — preserving single-tenant/local behavior.
 */
export async function resolveWorkspaceMediaAccess(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<MediaAccess> {
  // 1) Per-workspace BYO Gemini key (only when the connector is enabled + credentialed).
  if (workspaceId && (client || isSupabaseAdminConfigured())) {
    try {
      const db = client ?? getSupabaseAdminClient();
      const ref = await resolveConnectorCredentialRef(db, workspaceId, "gemini-research");
      const key = ref ? (await readConnectorCredential(db, ref))?.trim() : null;
      if (key) return { enabled: true, apiKey: key, source: "workspace" };
    } catch {
      // Fall through to the shared env key on any resolution error.
    }
  }

  // 2) Shared env key, gated by the global master switch.
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (process.env.ARC_MEDIA_ENABLED === "1" && envKey) {
    return { enabled: true, apiKey: envKey, source: "env" };
  }

  return DISABLED;
}
