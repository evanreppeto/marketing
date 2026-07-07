import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

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
  return <SettingsView brandName={brandName} email={email} />;
}
