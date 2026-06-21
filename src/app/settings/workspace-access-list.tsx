"use client";

import { RefreshCw, Trash2, UserCog, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, StatusPill } from "../_components/page-header";
import type { WorkspaceInviteSummary, WorkspaceTeamMember } from "@/lib/auth/workspace-invites";

function formatDate(value: string | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleDateString();
}

function labelForEmail(member: WorkspaceTeamMember) {
  return member.email || (member.userId ? `User ${member.userId.slice(0, 8)}` : "Invited member");
}

const roleOptions = [
  ["admin", "Admin"],
  ["marketer", "Marketer"],
  ["reviewer", "Reviewer"],
  ["member", "Member"],
  ["viewer", "Viewer"],
] as const;

export function WorkspaceAccessList({
  canManage,
  invites,
  members,
  workspaceId,
}: {
  canManage: boolean;
  invites: WorkspaceInviteSummary[];
  members: WorkspaceTeamMember[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [visibleInvites, setVisibleInvites] = useState(invites);
  const [visibleMembers, setVisibleMembers] = useState(members);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function updateRole(memberId: string, role: string) {
    setPendingMemberId(memberId);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/workspace-members", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, role, workspaceId }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string; role?: string };
      if (!body.ok || !body.role) {
        setMessage(body.message || "Member role could not be updated.");
        return;
      }

      setVisibleMembers((current) =>
        current.map((member) => (member.id === memberId ? { ...member, role: body.role ?? role } : member)),
      );
      setMessage("Member role updated.");
      router.refresh();
    } catch {
      setMessage("Member role could not be updated.");
    } finally {
      setPendingMemberId(null);
    }
  }

  async function removeMember(memberId: string) {
    setPendingMemberId(memberId);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/workspace-members", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, workspaceId }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!body.ok) {
        setMessage(body.message || "Member could not be removed.");
        return;
      }

      setVisibleMembers((current) => current.filter((member) => member.id !== memberId));
      setMessage("Member removed.");
      router.refresh();
    } catch {
      setMessage("Member could not be removed.");
    } finally {
      setPendingMemberId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    setPendingInviteId(inviteId);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/workspace-invites", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteId, workspaceId }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!body.ok) {
        setMessage(body.message || "Invite could not be revoked.");
        return;
      }

      setVisibleInvites((current) => current.filter((invite) => invite.id !== inviteId));
      setMessage("Invite revoked.");
      router.refresh();
    } catch {
      setMessage("Invite could not be revoked.");
    } finally {
      setPendingInviteId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <UserRound aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Members
          </div>
          <StatusPill tone="gray">{visibleMembers.length}</StatusPill>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {visibleMembers.length ? (
            visibleMembers.map((member) => {
              const manageable = canManage && member.status === "active" && member.role !== "owner";
              return (
                <div
                  className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_150px_120px_auto] lg:items-center"
                  key={member.id}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{labelForEmail(member)}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">Joined {formatDate(member.joinedAt)}</div>
                  </div>
                  {manageable ? (
                    <label className="flex items-center gap-2">
                      <UserCog aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      <select
                        className="min-h-9 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 text-xs font-semibold capitalize text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                        defaultValue={member.role}
                        disabled={pendingMemberId === member.id}
                        onChange={(event) => updateRole(member.id, event.currentTarget.value)}
                      >
                        {roleOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="text-xs font-semibold capitalize text-[var(--text-secondary)]">{member.role}</div>
                  )}
                  <StatusPill tone={member.status === "active" ? "green" : "amber"}>{member.status}</StatusPill>
                  {manageable ? (
                    <Button
                      disabled={pendingMemberId === member.id}
                      onClick={() => removeMember(member.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {pendingMemberId === member.id ? (
                        <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 aria-hidden className="h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-4 text-sm text-[var(--text-muted)]">No workspace members yet.</div>
          )}
        </div>
      </section>

      <section className="border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
          <div className="text-sm font-bold text-[var(--text-primary)]">Active invite codes</div>
          <StatusPill tone="gray">{visibleInvites.length}</StatusPill>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {visibleInvites.length ? (
            visibleInvites.map((invite) => (
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_90px_130px_auto] lg:items-center" key={invite.id}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {invite.invitedEmail || "Open invite"}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">Created {formatDate(invite.createdAt)}</div>
                </div>
                <div className="text-xs font-semibold capitalize text-[var(--text-secondary)]">{invite.role}</div>
                <div className="text-xs text-[var(--text-muted)]">Expires {formatDate(invite.expiresAt)}</div>
                {canManage ? (
                  <Button
                    disabled={pendingInviteId === invite.id}
                    onClick={() => revokeInvite(invite.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {pendingInviteId === invite.id ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden className="h-4 w-4" />}
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-[var(--text-muted)]">No active invite codes.</div>
          )}
        </div>
      </section>

      {message ? <div className="text-xs font-semibold text-[var(--text-muted)]">{message}</div> : null}
    </div>
  );
}
