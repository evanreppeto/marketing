import { redirect } from "next/navigation";

import { getViewerAvatarUrl, resolveViewerName } from "@/lib/auth/display-name";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSettingsWorkspacesView } from "@/lib/auth/workspaces-view";
import { getAppSettings } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getNavBadges } from "@/lib/workspace-summary/read-model";

import { AppShell } from "./_components/app-shell";
import "./arc-app.css";

// Every signed-in screen requires per-request auth + live per-workspace data, so
// this segment is always dynamic — it must never be statically prerendered. This
// is also load-bearing for the build: (app)/loading.tsx makes Next try to
// prerender each route's shell, which runs this auth layout; at build time (CI,
// no Supabase env) that throws WorkspaceUnavailableError. Forcing dynamic skips
// the build-time prerender while the loading boundary still streams instantly at
// runtime.
export const dynamic = "force-dynamic";

// Shared shell for the signed-in app screens (Home, Campaigns, … as they are
// ported). Resolves the workspace once here — a screen inside can re-read it via
// the cached getCurrentWorkspaceContext() without another round trip.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await getCurrentWorkspaceContext();
  } catch {
    redirect("/login");
  }
  if (!ctx.workspaceId) redirect("/onboarding");

  const user = await getSupabaseAuthenticatedUser();
  const userName = await resolveViewerName(ctx.orgId, user);
  // Rail attention counts from the shared summary — same source the screens
  // render, so a badge never disagrees with the page it points at.
  const navBadges = await getNavBadges(ctx.orgId).catch(() => ({}));
  // Workspaces the viewer can switch between — powers the rail's workspace menu.
  const workspacesView = await getSettingsWorkspacesView().catch(() => ({ isDemo: false, workspaces: [] }));
  // Branding: workspace logo (org-scoped) + the viewer's profile photo, rendered
  // in the rail in place of the initials monograms when set.
  const appSettings = await getAppSettings(ctx.orgId).catch(() => null);
  const logoUrl = appSettings?.brandLogoUrl?.startsWith("http") ? appSettings.brandLogoUrl : null;
  const avatarUrl = await getViewerAvatarUrl(user).catch(() => null);

  return (
    <AppShell
      workspaceName={ctx.workspaceName}
      orgName={ctx.orgName}
      userName={userName}
      userEmail={user?.email ?? ""}
      logoUrl={logoUrl}
      avatarUrl={avatarUrl}
      workspaces={workspacesView.workspaces}
      navBadges={navBadges}
    >
      {children}
    </AppShell>
  );
}
