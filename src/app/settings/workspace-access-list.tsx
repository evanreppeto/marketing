"use client";

import { RefreshCw, Trash2, UserRound } from "lucide-react";
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
  const [message, setMessage] = useState<string | null>(null);

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
          <StatusPill tone="gray">{members.length}</StatusPill>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {members.length ? (
            members.map((member) => (
              <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_110px_120px] sm:items-center" key={member.id}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{labelForEmail(member)}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">Joined {formatDate(member.joinedAt)}</div>
                </div>
                <div className="text-xs font-semibold capitalize text-[var(--text-secondary)]">{member.role}</div>
                <StatusPill tone={member.status === "active" ? "green" : "amber"}>{member.status}</StatusPill>
              </div>
            ))
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
