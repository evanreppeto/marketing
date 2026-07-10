import { getViewerAvatarUrl } from "@/lib/auth/display-name";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSettingsTeamView } from "@/lib/auth/team-view";
import { getSettingsWorkspacesView } from "@/lib/auth/workspaces-view";
import { getSettingsUsageView } from "@/lib/ai-usage/settings-summary";
import { getSettingsConnectorsView } from "@/lib/connectors/settings-connectors";
import { getConnectorSpendView } from "@/lib/connectors/spend-summary";
import { getAppSettings } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

import { SettingsView } from "./_components/settings-view";
import "./settings.css";

export const metadata = { title: "Settings — Arc" };

export default async function SettingsPage() {
  // Resolve the workspace first (React-cached) so its org scopes the settings read.
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const [user, team, usage, connectorSpend, settings, connectors, workspaces] = await Promise.all([
    getSupabaseAuthenticatedUser().catch(() => null),
    getSettingsTeamView().catch(() => ({ workspaceId: null, isDemo: false, members: [], invites: [], activity: [] })),
    getSettingsUsageView().catch(() => null),
    getConnectorSpendView().catch(() => null),
    getAppSettings(ctx?.orgId ?? null),
    getSettingsConnectorsView().catch(() => ({ configured: false, connectors: [] })),
    getSettingsWorkspacesView().catch(() => ({ isDemo: false, workspaces: [] })),
  ]);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  const email = user?.email || "owner@bsr.test";
  const avatarUrl = await getViewerAvatarUrl(user);
  return <SettingsView brandName={brandName} email={email} avatarUrl={avatarUrl} team={team} usage={usage} connectorSpend={connectorSpend} settings={settings} connectors={connectors} workspaces={workspaces} />;
}
