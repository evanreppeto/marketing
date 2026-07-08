import { DEFAULT_MEDIA_CONFIG } from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceMediaConfig } from "@/lib/media-config/read-model";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { SettingsView } from "./_components/settings-view";
import "./settings.css";

export const metadata = { title: "Settings — Arc" };

export default async function SettingsPage() {
  const [ctx, user] = await Promise.all([
    getCurrentWorkspaceContext().catch(() => null),
    getSupabaseAuthenticatedUser().catch(() => null),
  ]);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  const email = user?.email || "owner@bsr.test";
  const mediaConfig =
    ctx?.workspaceId && isSupabaseAdminConfigured()
      ? await getWorkspaceMediaConfig(getSupabaseAdminClient(), ctx.workspaceId).catch(() => DEFAULT_MEDIA_CONFIG)
      : DEFAULT_MEDIA_CONFIG;
  return <SettingsView brandName={brandName} email={email} initialMediaConfig={mediaConfig} />;
}
