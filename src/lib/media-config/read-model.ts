import { type SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_MEDIA_CONFIG, type MediaConfig, parseMediaConfig } from "@/domain";

// Workspace-scoped read of workspace_media_config. The app uses a service-role
// client, so this scopes by workspace_id in code (RLS is not the backstop).
// Untyped table access (workspace_media_config is not in generated database.types).

/**
 * The media config for a workspace, always a fully-formed MediaConfig — a missing
 * row (or any stored junk) resolves to DEFAULT_MEDIA_CONFIG via parseMediaConfig.
 * Shared by the Settings page (operator view) and the runner route (agent input).
 */
export async function getWorkspaceMediaConfig(
  client: SupabaseClient,
  workspaceId: string,
): Promise<MediaConfig> {
  const { data, error } = await client
    .from("workspace_media_config")
    .select("config")
    .eq("workspace_id", workspaceId)
    .maybeSingle<{ config: unknown }>();

  if (error) {
    console.warn(`workspace_media_config lookup failed, using defaults: ${error.message}`);
    return DEFAULT_MEDIA_CONFIG;
  }
  return parseMediaConfig(data?.config);
}
