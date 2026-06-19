import { LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";

import { StatusPill } from "../_components/page-header";
import { getCurrentWorkspaceContext, type WorkspaceRole } from "@/lib/auth/workspace";
import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";
import { WorkspaceAccessList } from "./workspace-access-list";
import { SettingsSection } from "./settings-section";
import { WorkspaceInviteForm } from "./workspace-invite-form";

function canIssueInvites(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

function roleLabel(role: WorkspaceRole | null | undefined) {
  if (!role) return "No active role";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export async function WorkspaceTeamSettings() {
  const context = await getCurrentWorkspaceContext().catch(() => null);
  const hasWorkspace = Boolean(context?.workspaceId);
  const canIssue = hasWorkspace && canIssueInvites(context?.role);
  const teamAccess = context?.workspaceId ? await listWorkspaceTeamAccess(context.workspaceId) : null;

  return (
    <SettingsSection
      actions={
        <StatusPill icon={canIssue ? <ShieldCheck /> : <LockKeyhole />} tone={canIssue ? "green" : "amber"}>
          {canIssue ? "Admin ready" : "Restricted"}
        </StatusPill>
      }
      description="Generate invite codes for the current workspace. Codes are stored hashed in Supabase and redeemed into workspace memberships."
      id="workspace"
      title="Team access"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Workspace</div>
            <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{context?.workspaceName ?? "Unavailable"}</div>
          </div>
          <div className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Your role</div>
            <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{roleLabel(context?.role)}</div>
          </div>
          <div className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Source</div>
            <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">
              {context?.source === "membership" ? "Membership" : "Preview workspace"}
            </div>
          </div>
        </div>

        {canIssue && context?.workspaceId ? (
          <>
            <div className="grid gap-3 border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <UsersRound aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                New workspace invite
              </div>
              <WorkspaceInviteForm workspaceId={context.workspaceId} />
            </div>

            {teamAccess?.ok ? (
              <WorkspaceAccessList
                canManage={canIssue}
                invites={teamAccess.invites}
                members={teamAccess.members}
                workspaceId={context.workspaceId}
              />
            ) : (
              <div className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm text-[var(--text-secondary)]">
                Workspace access records will appear here after signing in with a workspace member account.
              </div>
            )}
          </>
        ) : (
          <div className="flex gap-3 border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <LockKeyhole aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn-text)]" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {hasWorkspace ? "Owner or admin access required" : "Workspace membership required"}
              </div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Sign in with an owner or admin account to issue invite codes for this workspace.
              </p>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
