import { DEFAULT_MEDIA_CONFIG } from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSettingsWorkspacesView } from "@/lib/auth/workspaces-view";
import { getSettingsUsageView } from "@/lib/ai-usage/settings-summary";
import { getSettingsConnectorsView } from "@/lib/connectors/settings-connectors";
import { getAppSettings } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { SettingsView } from "./_components/settings-view";
import "./settings.css";

export const metadata = { title: "Settings — Arc" };

export default async function SettingsPage() {
  // Resolve the workspace first (React-cached) so its org scopes the settings read.
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const [user, team, usage, settings, connectors, workspaces] = await Promise.all([
    getSupabaseAuthenticatedUser().catch(() => null),
    getSettingsTeamView().catch(() => ({ workspaceId: null, isDemo: false, members: [], invites: [], activity: [] })),
    getSettingsUsageView().catch(() => null),
    getAppSettings(ctx?.orgId ?? null),
    getSettingsConnectorsView().catch(() => ({ configured: false, connectors: [] })),
    getSettingsWorkspacesView().catch(() => ({ isDemo: false, workspaces: [] })),
  ]);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  const email = user?.email || "owner@bsr.test";
  return <SettingsView brandName={brandName} email={email} team={team} usage={usage} settings={settings} connectors={connectors} workspaces={workspaces} />;
}
