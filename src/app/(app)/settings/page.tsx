import { DEFAULT_MEDIA_CONFIG } from "@/domain";
import { getSettingsUsageView } from "@/lib/ai-usage/settings-summary";
import { getSettingsTeamView } from "@/lib/auth/team-view";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceMediaConfig } from "@/lib/media-config/read-model";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { SettingsView } from "./_components/settings-view";
import "./settings.css";

export const metadata = { title: "Settings — Arc" };

export default async function SettingsPage() {
  const [ctx, user, team, usage] = await Promise.all([
    getCurrentWorkspaceContext().catch(() => null),
    getSupabaseAuthenticatedUser().catch(() => null),
    getSettingsTeamView().catch(() => ({ workspaceId: null, isDemo: false, members: [], invites: [] })),
    getSettingsUsageView().catch(() => null),
  ]);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  const email = user?.email || "owner@bsr.test";
  const mediaConfig =
    ctx?.workspaceId && isSupabaseAdminConfigured()
      ? await getWorkspaceMediaConfig(getSupabaseAdminClient(), ctx.workspaceId).catch(() => DEFAULT_MEDIA_CONFIG)
      : DEFAULT_MEDIA_CONFIG;
  return <SettingsView brandName={brandName} email={email} team={team} usage={usage} initialMediaConfig={mediaConfig} />;
}
