// ---------------------------------------------------------------------------
// Settings → Team view-model. Turns the real workspace team-access read-model
// (members + pending invites) into the shape the Settings Team section renders.
// Live via listWorkspaceTeamAccess when signed in + configured; a BSR-flavoured
// demo team in the offline preview (ARC_DEMO_DATA); empty otherwise. Read-only
// assembly — mutations go through the settings server actions.
// ---------------------------------------------------------------------------

import { getCurrentWorkspaceContext } from "./workspace";
import { listWorkspaceActivity, type WorkspaceActivityEntry } from "./workspace-admin";
import { listWorkspaceTeamAccess } from "./workspace-invites";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type { WorkspaceActivityEntry };

export type SettingsTeamMember = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  isOwner: boolean;
  pending: boolean;
};

export type SettingsTeamInvite = {
  id: string;
  email: string;
  role: string;
  note: string;
};

export type SettingsTeamView = {
  workspaceId: string | null;
  isDemo: boolean;
  members: SettingsTeamMember[];
  invites: SettingsTeamInvite[];
  activity: WorkspaceActivityEntry[];
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  marketer: "Marketer",
  reviewer: "Reviewer",
  member: "Member",
  viewer: "Viewer",
};

export function roleLabelOf(role: string): string {
  return ROLE_LABELS[role?.toLowerCase()] ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member");
}

function inviteNote(role: string, expiresAt: string | null, nowMs: number): string {
  const label = roleLabelOf(role);
  if (!expiresAt) return label;
  const days = Math.ceil((new Date(expiresAt).getTime() - nowMs) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(days)) return label;
  if (days <= 0) return `${label} · expired`;
  return `${label} · expires in ${days} ${days === 1 ? "day" : "days"}`;
}

type TeamAccessMember = { id: string; email: string | null; role: string; status: string };
type TeamAccessInvite = { id: string; invitedEmail: string | null; role: string; expiresAt: string | null };

/** Pure: the workspace team-access rows → the Settings view-model. */
export function toTeamView(
  workspaceId: string | null,
  members: TeamAccessMember[],
  invites: TeamAccessInvite[],
  isDemo: boolean,
  nowMs: number,
  activity: WorkspaceActivityEntry[] = [],
): SettingsTeamView {
  return {
    workspaceId,
    isDemo,
    activity,
    members: members.map((m) => ({
      id: m.id,
      email: m.email ?? "Workspace member",
      role: m.role,
      roleLabel: roleLabelOf(m.role),
      isOwner: m.role?.toLowerCase() === "owner",
      pending: m.status === "invited",
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.invitedEmail ?? "Pending teammate",
      role: roleLabelOf(i.role),
      note: inviteNote(i.role, i.expiresAt, nowMs),
    })),
  };
}

function demoActivity(nowMs: number): WorkspaceActivityEntry[] {
  const at = (mins: number) => new Date(nowMs - mins * 60_000).toISOString();
  return [
    { id: "act-1", action: "member.role_changed", summary: "Changed priya@bigshouldersrestoration.com to Marketer", actorEmail: "owner@bigshouldersrestoration.com", createdAt: at(95) },
    { id: "act-2", action: "member.invited", summary: "Invited jordan@bigshouldersrestoration.com as Marketer", actorEmail: "dana@bigshouldersrestoration.com", createdAt: at(60 * 21) },
    { id: "act-3", action: "workspace.renamed", summary: "Renamed the workspace to Big Shoulders Restoration", actorEmail: "owner@bigshouldersrestoration.com", createdAt: at(60 * 24 * 4) },
    { id: "act-4", action: "member.removed", summary: "Removed alex@bigshouldersrestoration.com", actorEmail: "owner@bigshouldersrestoration.com", createdAt: at(60 * 24 * 9) },
  ];
}

function demoTeamView(nowMs: number): SettingsTeamView {
  return {
    workspaceId: null,
    isDemo: true,
    members: [
      { id: "demo-owner", email: "owner@bigshouldersrestoration.com", role: "owner", roleLabel: "Owner", isOwner: true, pending: false },
      { id: "demo-admin", email: "dana@bigshouldersrestoration.com", role: "admin", roleLabel: "Admin", isOwner: false, pending: false },
      { id: "demo-marketer", email: "priya@bigshouldersrestoration.com", role: "marketer", roleLabel: "Marketer", isOwner: false, pending: false },
      { id: "demo-reviewer", email: "sam@bigshouldersrestoration.com", role: "reviewer", roleLabel: "Reviewer", isOwner: false, pending: false },
    ],
    invites: [{ id: "demo-invite", email: "jordan@bigshouldersrestoration.com", role: "Marketer", note: "Marketer · expires in 12 days" }],
    activity: demoActivity(nowMs),
  };
}

const EMPTY: SettingsTeamView = { workspaceId: null, isDemo: false, members: [], invites: [], activity: [] };

export async function getSettingsTeamView(): Promise<SettingsTeamView> {
  if (isSupabaseAdminConfigured()) {
    try {
      const ctx = await getCurrentWorkspaceContext();
      if (ctx.workspaceId) {
        const [access, activity] = await Promise.all([
          listWorkspaceTeamAccess(ctx.workspaceId),
          listWorkspaceActivity(ctx.workspaceId).catch(() => [] as WorkspaceActivityEntry[]),
        ]);
        if (access.ok) {
          return toTeamView(ctx.workspaceId, access.members, access.invites, false, Date.now(), activity);
        }
      }
    } catch {
      // fall through to demo/empty
    }
  }

  if (isDemoDataEnabled()) return demoTeamView(Date.now());
  return EMPTY;
}
