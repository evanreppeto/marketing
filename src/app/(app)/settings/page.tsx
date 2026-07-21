import { resolveAgentConnection } from "@/lib/agent/connection";
import { getViewerAvatarUrl } from "@/lib/auth/display-name";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSettingsTeamView } from "@/lib/auth/team-view";
import { getSettingsWorkspacesView } from "@/lib/auth/workspaces-view";
import { getSettingsUsageView } from "@/lib/ai-usage/settings-summary";
import { getSettingsBillingView } from "@/lib/billing/settings-billing";
import { getSettingsConnectorsView } from "@/lib/connectors/settings-connectors";
import { getEmailConnection } from "@/lib/connections/read-model";
import { getConnectorSpendView } from "@/lib/connectors/spend-summary";
import { isLiveSendEnabled } from "@/lib/dispatch/live-send";
import { getOrgPersonaOptions } from "@/lib/personas/read-model";
import { getAppSettings } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

import { SettingsView } from "./_components/settings-view";
import "./settings.css";

export const metadata = { title: "Settings — Arc" };

export default async function SettingsPage() {
  // Resolve the workspace first (React-cached) so its org scopes the settings read.
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const [user, team, usage, connectorSpend, billing, settings, connectors, workspaces, emailConnection, agentConnection] = await Promise.all([
    getSupabaseAuthenticatedUser().catch(() => null),
    getSettingsTeamView().catch(() => ({ workspaceId: null, isDemo: false, members: [], invites: [], activity: [] })),
    getSettingsUsageView().catch(() => null),
    getConnectorSpendView().catch(() => null),
    getSettingsBillingView().catch(() => null),
    getAppSettings(ctx?.orgId ?? null),
    getSettingsConnectorsView().catch(() => ({ configured: false, connectors: [] })),
    getSettingsWorkspacesView().catch(() => ({ isDemo: false, workspaces: [] })),
    getEmailConnection().catch(() => null),
    resolveAgentConnection().catch(() => null),
  ]);
  // The workspace's own personas, for the connector "Default persona" picker.
  const personaOptions = await getOrgPersonaOptions(ctx?.orgId ?? undefined).catch(() => []);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  const email = user?.email || "owner@bsr.test";
  const avatarUrl = await getViewerAvatarUrl(user);
  // The deployment-level send kill-switch. Read here (server-side env) so the
  // email card can tell the truth: an enabled Resend connection still sends
  // nothing while this is dark.
  const liveSendEnabled = isLiveSendEnabled();
  return <SettingsView brandName={brandName} email={email} avatarUrl={avatarUrl} team={team} usage={usage} connectorSpend={connectorSpend} billing={billing} settings={settings} connectors={connectors} workspaces={workspaces} emailConnection={emailConnection} liveSendEnabled={liveSendEnabled} agentConnection={agentConnection} personaOptions={personaOptions} />;
}
