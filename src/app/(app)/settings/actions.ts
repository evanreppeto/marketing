"use server";

import { revalidatePath } from "next/cache";

import { type MediaConfig, parseMediaConfig } from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { saveWorkspaceMediaConfig } from "@/lib/media-config/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Persist the workspace's media generation config (Layer 2 model selection).
 * Operator-gated through the authenticated workspace context; scoped to the
 * caller's workspace. The payload is re-normalized via parseMediaConfig so an
 * invalid model id from the client is dropped to "auto" before it lands. Nothing
 * outbound — this only records how Arc should generate on the next run.
 */
export async function saveMediaConfigAction(config: MediaConfig): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return; // no workspace yet — the (app) layout redirects to onboarding
  await saveWorkspaceMediaConfig(getSupabaseAdminClient(), {
    workspaceId: ctx.workspaceId,
    orgId: ctx.orgId,
    config: parseMediaConfig(config),
  });
  revalidatePath("/settings");
}
