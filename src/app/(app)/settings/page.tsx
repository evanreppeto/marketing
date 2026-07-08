import { getSettingsTeamView } from "@/lib/auth/team-view";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSettingsUsageView } from "@/lib/ai-usage/settings-summary";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

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
  return <SettingsView brandName={brandName} email={email} team={team} usage={usage} />;
}
