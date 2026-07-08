// ---------------------------------------------------------------------------
// Settings → Team view-model. Turns the real workspace team-access read-model
// (members + pending invites) into the shape the Settings Team section renders.
// Live via listWorkspaceTeamAccess when signed in + configured; a BSR-flavoured
// demo team in the offline preview (ARC_DEMO_DATA); empty otherwise. Read-only
// assembly — mutations go through the settings server actions.
// ---------------------------------------------------------------------------

import { getCurrentWorkspaceContext } from "./workspace";
import { listWorkspaceTeamAccess } from "./workspace-invites";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

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
): SettingsTeamView {
  return {
    workspaceId,
    isDemo,
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

function demoTeamView(): SettingsTeamView {
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
  };
}

const EMPTY: SettingsTeamView = { workspaceId: null, isDemo: false, members: [], invites: [] };

export async function getSettingsTeamView(): Promise<SettingsTeamView> {
  if (isSupabaseAdminConfigured()) {
    try {
      const ctx = await getCurrentWorkspaceContext();
      if (ctx.workspaceId) {
        const access = await listWorkspaceTeamAccess(ctx.workspaceId);
        if (access.ok) {
          return toTeamView(ctx.workspaceId, access.members, access.invites, false, Date.now());
        }
      }
    } catch {
      // fall through to demo/empty
    }
  }

  if (isDemoDataEnabled()) return demoTeamView();
  return EMPTY;
}
