"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/app/_components/theme";
import type { MarkProject } from "@/lib/mark-chat/persistence";

import {
  archiveThreadForm,
  deleteThreadForm,
  moveConversationForm,
  pinThreadForm,
  unpinThreadForm,
} from "../actions";
import { IconButton } from "./icon-button";

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  );
}

export function ThreadMenu({
  conversationId,
  projectId,
  pinned,
  projects,
  isActive,
}: {
  conversationId: string;
  projectId: string | null;
  pinned: boolean;
  projects: MarkProject[];
  /** When true and the thread is deleted, navigate back to /mark. */
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]";

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        label="Thread options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <DotsIcon />
      </IconButton>

      {open ? (
        <div
          role="menu"
          className="msg-rise absolute right-0 top-8 z-20 w-52 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]"
        >
          {/* Pin / Unpin */}
          <form action={pinned ? unpinThreadForm : pinThreadForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" role="menuitem" className={itemCls}>
              {pinned ? "Unpin" : "Pin to top"}
            </button>
          </form>

          {/* Move to project */}
          <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Move to project
          </div>
          <form action={moveConversationForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <select
              name="projectId"
              defaultValue={projectId ?? ""}
              aria-label="Move chat to project"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-secondary)]"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </form>

          {/* Archive */}
          <form action={archiveThreadForm} className="mt-1">
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" role="menuitem" className={itemCls}>
              Archive
            </button>
          </form>

          {/* Delete (inline confirm) */}
          {confirmDelete ? (
            <form
              action={deleteThreadForm}
              onSubmit={() => {
                if (isActive) router.push("/mark");
              }}
            >
              <input type="hidden" name="conversationId" value={conversationId} />
              <button
                type="submit"
                role="menuitem"
                className={cx(itemCls, "text-[var(--priority-bright)] hover:bg-[var(--priority-soft)]")}
              >
                Delete? Click to confirm
              </button>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirmDelete(true)}
              className={cx(itemCls, "text-[var(--priority-bright)] hover:bg-[var(--priority-soft)]")}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
