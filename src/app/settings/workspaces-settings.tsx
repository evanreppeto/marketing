import Link from "next/link";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspacesForUser } from "@/lib/auth/workspace-admin";
import { roleLabel } from "@/lib/auth/workspace-roles";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { StatusPill } from "../_components/page-header";
import { SettingsSection } from "./settings-section";
import { WorkspaceSwitcher } from "./workspace-switcher";

const WORKSPACE_TYPE_LABEL: Record<string, string> = {
  individual: "Personal",
  company: "Company",
  agency: "Agency",
};

/**
 * The user's workspaces. A single person may belong to several (a company
 * workspace, a personal one, an agency client) — this lists them all, marks the
 * active one, and lets the operator switch between them.
 */
export async function WorkspacesSettings() {
  if (!isSupabaseAdminConfigured()) {
    return (
      <SettingsSection description="Switch between the workspaces you belong to." title="Workspaces">
        <div className="rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-muted)]">
          Workspaces appear here once Supabase is connected. This local preview runs without it.
        </div>
      </SettingsSection>
    );
  }

  const [workspaces, context] = await Promise.all([
    listWorkspacesForUser(),
    getCurrentWorkspaceContext().catch(() => null),
  ]);
  const activeId = context?.workspaceId ?? null;

  return (
    <SettingsSection
      actions={<StatusPill tone="gray">{workspaces.length} total</StatusPill>}
      bodyClassName="p-0"
      description="Each workspace keeps its own brand, team, campaigns, and Arc. Switch the one you're working in."
      title="Workspaces"
    >
      {workspaces.length === 0 ? (
        <div className="px-5 py-6 text-sm text-[var(--text-muted)]">
          You&rsquo;re not signed in to a workspace yet. Sign in, or create one below.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-hairline)]">
          {workspaces.map((workspace) => {
            const isActive = workspace.workspaceId === activeId;
            return (
              <li className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" key={workspace.workspaceId}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] font-display text-sm font-bold text-[var(--text-secondary)]">
                    {workspace.workspaceName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-[var(--text-primary)]">{workspace.workspaceName}</span>
                      {isActive ? <StatusPill tone="green">Active</StatusPill> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                      <span>{WORKSPACE_TYPE_LABEL[workspace.workspaceType] ?? workspace.workspaceType}</span>
                      <span>{workspace.orgName}</span>
                      <span>Your role: {roleLabel(workspace.role)}</span>
                    </div>
                  </div>
                </div>
                {isActive ? (
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Current</span>
                ) : (
                  <WorkspaceSwitcher workspaceId={workspace.workspaceId} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="text-xs leading-5 text-[var(--text-muted)]">
          Need a separate space — a personal workspace or a new client? Create one and you&rsquo;ll be its owner.
        </div>
        <Link
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)]"
          href="/onboarding"
        >
          Create workspace
        </Link>
      </div>
    </SettingsSection>
  );
}
