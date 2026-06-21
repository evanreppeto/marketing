import { History, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";

import { StatusPill } from "../_components/page-header";
import { getCurrentWorkspaceContext, type WorkspaceRole } from "@/lib/auth/workspace";
import { listWorkspaceActivity, type WorkspaceActivityEntry } from "@/lib/auth/workspace-admin";
import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";
import { auditActionLabel } from "@/lib/auth/workspace-audit";
import { WORKSPACE_ROLES, roleLabel } from "@/lib/auth/workspace-roles";
import { WorkspaceAccessList } from "./workspace-access-list";
import { SettingsSection } from "./settings-section";
import { WorkspaceInviteForm } from "./workspace-invite-form";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActivityFeed({ entries }: { entries: WorkspaceActivityEntry[] }) {
  return (
    <section className="border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]">
        <History aria-hidden className="h-4 w-4 text-[var(--accent)]" />
        Activity
      </div>
      {entries.length ? (
        <ul className="divide-y divide-[var(--border-hairline)]">
          {entries.map((entry) => (
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3" key={entry.id}>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{auditActionLabel(entry.action)}</span>
                {entry.summary ? <span className="ml-2 text-xs text-[var(--text-muted)]">{entry.summary}</span> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                {entry.actorEmail ? <span className="text-[var(--text-secondary)]">{entry.actorEmail}</span> : null}
                <span>{relativeTime(entry.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-4 text-sm text-[var(--text-muted)]">No activity recorded yet.</div>
      )}
    </section>
  );
}

function canIssueInvites(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function RolesGuide() {
  return (
    <details className="group rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
      <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">Roles &amp; permissions</summary>
      <div className="mt-3 grid gap-2">
        {WORKSPACE_ROLES.map((info) => (
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" key={info.role}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">{info.label}</span>
              <span className="text-xs text-[var(--text-muted)]">{info.summary}</span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
              {info.capabilities.map((capability) => (
                <li className="before:mr-1.5 before:text-[var(--accent)] before:content-['•']" key={capability}>
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

/** Admin / team management for the active workspace: members, roles, and invites. */
export async function WorkspaceTeamSettings() {
  const context = await getCurrentWorkspaceContext().catch(() => null);
  const hasWorkspace = Boolean(context?.workspaceId);
  const canIssue = hasWorkspace && canIssueInvites(context?.role);
  const teamAccess = context?.workspaceId ? await listWorkspaceTeamAccess(context.workspaceId) : null;
  const memberCount = teamAccess?.ok ? teamAccess.members.length : null;
  const activity = canIssue && context?.workspaceId ? await listWorkspaceActivity(context.workspaceId) : [];

  return (
    <SettingsSection
      actions={
        <StatusPill icon={canIssue ? <ShieldCheck /> : <LockKeyhole />} tone={canIssue ? "green" : "amber"}>
          {canIssue ? "Admin" : "Restricted"}
        </StatusPill>
      }
      description="Manage who's in this workspace, their roles, and the invite codes used to join."
      id="workspace"
      title="Team"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Organization" value={context?.orgName ?? "Unavailable"} />
          <Detail label="Workspace" value={context?.workspaceName ?? "Unavailable"} />
          <Detail label="Your role" value={roleLabel(context?.role ?? "—")} />
          <Detail label="Members" value={memberCount != null ? String(memberCount) : "—"} />
        </div>

        <RolesGuide />

        {canIssue && context?.workspaceId ? (
          <>
            <div className="grid gap-3 border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <UsersRound aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Invite a teammate
              </div>
              <WorkspaceInviteForm workspaceId={context.workspaceId} />
            </div>

            {teamAccess?.ok ? (
              <WorkspaceAccessList
                canManage={canIssue}
                currentUserId={context.userId}
                invites={teamAccess.invites}
                members={teamAccess.members}
                workspaceId={context.workspaceId}
              />
            ) : (
              <div className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm text-[var(--text-secondary)]">
                Workspace access records will appear here after signing in with a workspace member account.
              </div>
            )}

            <ActivityFeed entries={activity} />
          </>
        ) : hasWorkspace && context?.workspaceId && teamAccess?.ok ? (
          <WorkspaceAccessList
            canManage={false}
            currentUserId={context.userId}
            invites={teamAccess.invites}
            members={teamAccess.members}
            workspaceId={context.workspaceId}
          />
        ) : (
          <div className="flex gap-3 border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <LockKeyhole aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn-text)]" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {hasWorkspace ? "Sign in to manage the team" : "Workspace membership required"}
              </div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Sign in with a workspace member account to view members and manage invites.
              </p>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
