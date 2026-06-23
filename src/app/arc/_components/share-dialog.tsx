"use client";

import { useState } from "react";
import { useActionState } from "react";

import { cx } from "@/app/_components/theme";

import {
  setConversationVisibilityAction,
  shareConversationAction,
  unshareConversationAction,
  type ShareActionState,
} from "../sharing-actions";

export type ShareMember = { userId: string; label: string };
export type ConversationShare = { userId: string; permission: "view" | "collaborate" };

const INITIAL: ShareActionState = { ok: false, message: "" };

const permissionLabel: Record<"view" | "collaborate", string> = {
  view: "Can view",
  collaborate: "Can collaborate",
};

export function ShareDialog({
  conversationId,
  visibility,
  workspacePermission,
  members,
  shares,
  onClose,
}: {
  conversationId: string;
  visibility: "private" | "workspace";
  workspacePermission: "view" | "collaborate";
  members: ShareMember[];
  shares: ConversationShare[];
  onClose?: () => void;
}) {
  const [visState, visAction] = useActionState(setConversationVisibilityAction, INITIAL);
  const [shareState, shareAction] = useActionState(shareConversationAction, INITIAL);
  const [removeState, removeAction] = useActionState(unshareConversationAction, INITIAL);

  // Local form state for the member picker so the labelled selects stay controlled.
  const [pickedUserId, setPickedUserId] = useState("");
  const [pickedPermission, setPickedPermission] = useState<"view" | "collaborate">("view");

  const status = visState.message || shareState.message || removeState.message;
  const lastOk = visState.ok || shareState.ok || removeState.ok;

  const sharedUserIds = new Set(shares.map((s) => s.userId));
  const candidates = members.filter((m) => !sharedUserIds.has(m.userId));
  const labelFor = (userId: string) => members.find((m) => m.userId === userId)?.label ?? "Teammate";

  const isWorkspace = visibility === "workspace";
  // Toggling flips to the opposite visibility; permission carries the current
  // workspace permission so the server keeps the existing collaborate/view setting.
  const nextVisibility = isWorkspace ? "private" : "workspace";

  const fieldLabel =
    "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]";
  const selectCls =
    "h-8 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          Share this chat
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Workspace visibility toggle */}
      <form action={visAction} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="visibility" value={nextVisibility} />
        <input type="hidden" name="permission" value={workspacePermission} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--text-primary)]">Visible to everyone in this workspace</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">
            {isWorkspace ? "Anyone in the workspace can open this chat." : "Only you and people you add can open this chat."}
          </p>
        </div>
        <button
          type="submit"
          role="switch"
          aria-checked={isWorkspace}
          aria-label="Toggle workspace visibility"
          className={cx(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition",
            isWorkspace ? "bg-[var(--accent)]" : "bg-[var(--surface-raised)] shadow-[inset_0_0_0_1px_var(--border-strong)]",
          )}
        >
          <span
            className={cx(
              "inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--on-accent)] transition",
              isWorkspace ? "translate-x-[1.125rem]" : "translate-x-1",
            )}
          />
        </button>
      </form>

      {/* Member picker */}
      <form action={shareAction} className="flex flex-col gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="userId" value={pickedUserId} />
        <input type="hidden" name="permission" value={pickedPermission} />
        <span className={fieldLabel}>Add a teammate</span>
        <div className="flex items-center gap-2">
          <select
            aria-label="Teammate"
            value={pickedUserId}
            onChange={(e) => setPickedUserId(e.target.value)}
            className={cx(selectCls, "min-w-0 flex-1")}
          >
            <option value="">Select a teammate…</option>
            {candidates.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Permission"
            value={pickedPermission}
            onChange={(e) => setPickedPermission(e.target.value as "view" | "collaborate")}
            className={selectCls}
          >
            <option value="view">Can view</option>
            <option value="collaborate">Can collaborate</option>
          </select>
          <button
            type="submit"
            disabled={!pickedUserId}
            className={cx(
              "h-8 shrink-0 rounded-md px-3 text-xs font-semibold transition",
              pickedUserId
                ? "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
                : "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]",
            )}
          >
            Share
          </button>
        </div>
        {candidates.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            {members.length === 0 ? "No teammates in this workspace yet." : "Everyone available already has access."}
          </p>
        ) : null}
      </form>

      {/* Current shares */}
      {shares.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className={fieldLabel}>People with access</span>
          <ul className="flex flex-col gap-1">
            {shares.map((s) => (
              <li
                key={s.userId}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">{labelFor(s.userId)}</span>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{permissionLabel[s.permission]}</span>
                <form action={removeAction} className="shrink-0">
                  <input type="hidden" name="conversationId" value={conversationId} />
                  <input type="hidden" name="userId" value={s.userId} />
                  <button
                    type="submit"
                    aria-label={`Remove ${labelFor(s.userId)}`}
                    title="Remove access"
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--priority-bright)]"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status ? (
        <p className={cx("text-[11px] font-medium", lastOk ? "text-[var(--accent-contrast)]" : "text-[var(--priority-bright)]")}>
          {status}
        </p>
      ) : null}
    </div>
  );
}
