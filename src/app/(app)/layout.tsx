import { redirect } from "next/navigation";

import { resolveViewerName } from "@/lib/auth/display-name";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

import { AppShell } from "./_components/app-shell";
import "./arc-app.css";

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

  return (
    <AppShell
      workspaceName={ctx.workspaceName}
      orgName={ctx.orgName}
      userName={userName}
      userEmail={user?.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
