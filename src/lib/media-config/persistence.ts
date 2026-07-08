import { type SupabaseClient } from "@supabase/supabase-js";

import { type MediaConfig, parseMediaConfig } from "@/domain";

// Workspace-scoped write to workspace_media_config. Service-role client → scope by
// workspace_id in code. The value is re-normalized through parseMediaConfig before
// it lands, so a stray/invalid model id can never be persisted, even if a caller
// bypasses the domain layer. Untyped table access.

/** Upsert the full media config for a workspace (one row per workspace). */
export async function saveWorkspaceMediaConfig(
  client: SupabaseClient,
  input: { workspaceId: string; orgId: string | null; config: MediaConfig },
): Promise<void> {
  const { error } = await client.from("workspace_media_config").upsert(
    {
      workspace_id: input.workspaceId,
      org_id: input.orgId,
      config: parseMediaConfig(input.config),
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(`workspace_media_config upsert: ${error.message}`);
}
