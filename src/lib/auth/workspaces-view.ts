// ---------------------------------------------------------------------------
// Settings → Workspaces view. The real workspaces the signed-in user belongs to
// (listWorkspacesForUser) with the active one flagged; a BSR-flavoured demo list
// in the offline preview. Read-only assembly — switching goes through the
// switchWorkspace server action.
// ---------------------------------------------------------------------------

import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { getCurrentWorkspaceContext } from "./workspace";
import { listWorkspacesForUser } from "./workspace-admin";
import { roleLabel } from "./workspace-roles";

export type SettingsWorkspace = { id: string; name: string; meta: string; active: boolean };
export type SettingsWorkspacesView = { isDemo: boolean; workspaces: SettingsWorkspace[] };

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function demoWorkspaces(): SettingsWorkspacesView {
  return {
    isDemo: true,
    workspaces: [
      { id: "demo-bsr", name: "Big Shoulders Restoration", meta: "Owner · Restoration & home services", active: true },
      { id: "demo-summit", name: "Summit Restoration", meta: "Admin · Home services", active: false },
      { id: "demo-personal", name: "Personal", meta: "Owner · Sandbox", active: false },
    ],
  };
}

export async function getSettingsWorkspacesView(): Promise<SettingsWorkspacesView> {
  if (isSupabaseAdminConfigured()) {
    try {
      const [mine, ctx] = await Promise.all([
        listWorkspacesForUser(),
        getCurrentWorkspaceContext().catch(() => null),
      ]);
      if (mine.length) {
        return {
          isDemo: false,
          workspaces: mine.map((w) => ({
            id: w.workspaceId,
            name: w.orgName?.trim() || w.workspaceName,
            meta: `${roleLabel(w.role)} · ${titleCase(w.workspaceType)}`,
            active: w.workspaceId === ctx?.workspaceId,
          })),
        };
      }
    } catch {
      // fall through to demo/empty
    }
  }

  if (isDemoDataEnabled()) return demoWorkspaces();
  return { isDemo: false, workspaces: [] };
}
