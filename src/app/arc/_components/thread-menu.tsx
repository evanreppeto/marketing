"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { cx } from "@/app/_components/theme";
import type { ArcProject } from "@/lib/arc-chat/persistence";

import {
  archiveThreadForm,
  deleteThreadForm,
  moveConversationForm,
  pinThreadForm,
  renameThreadForm,
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

type ThreadMenuProps = {
  conversationId: string;
  projectId: string | null;
  pinned: boolean;
  projects: ArcProject[];
  /** Current title — prefills the inline rename field. */
  title: string;
  /** When true and the thread is deleted, navigate back to /arc. */
  isActive: boolean;
};

const itemCls =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]";

/** The shared action list, rendered inside both the dots dropdown and the
 *  right-click context menu. `onClose` dismisses whichever surface hosts it. */
function ThreadMenuItems({
  conversationId,
  projectId,
  pinned,
  projects,
  title,
  isActive,
  onClose,
}: ThreadMenuProps & { onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const router = useRouter();

  if (renaming) {
    return (
      <form
        action={renameThreadForm}
        onSubmit={() => onClose()}
        className="p-0.5"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input
          name="title"
          defaultValue={title}
          autoFocus
          aria-label="Rename chat"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setRenaming(false);
            }
          }}
          className="w-full rounded-md border border-[var(--accent)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-primary)] focus-visible:outline-none"
        />
        <p className="px-1 pt-1 text-[10px] text-[var(--text-muted)]">Enter to save · Esc to cancel</p>
      </form>
    );
  }

  return (
    <>
      <button type="button" role="menuitem" onClick={() => setRenaming(true)} className={itemCls}>
        Rename
      </button>

      {/* Pin / Unpin */}
      <form action={pinned ? unpinThreadForm : pinThreadForm} onSubmit={() => onClose()}>
        <input type="hidden" name="conversationId" value={conversationId} />
        <button type="submit" role="menuitem" className={itemCls}>
          {pinned ? "Unpin" : "Pin to top"}
        </button>
      </form>

      {/* Move to project */}
      <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Move to project
      </div>
      <form action={moveConversationForm} onSubmit={() => onClose()}>
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
      <form action={archiveThreadForm} onSubmit={() => onClose()} className="mt-1">
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
            if (isActive) router.push("/arc");
            onClose();
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
    </>
  );
}

/** Dots (…) button that opens the thread actions anchored beneath it. */
export function ThreadMenu(props: ThreadMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <IconButton label="Thread options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <DotsIcon />
      </IconButton>
      {open ? (
        <div
          role="menu"
          className="msg-rise absolute right-0 top-8 z-20 w-52 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]"
        >
          <ThreadMenuItems {...props} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

const MENU_W = 208; // w-52
const MENU_H = 260; // generous estimate for viewport clamping

/** Wraps a row so right-clicking it opens the same thread actions at the cursor.
 *  Renders through a portal so the sidebar's overflow can't clip the menu. */
export function ThreadContextMenu({
  className,
  children,
  ...menuProps
}: ThreadMenuProps & { className?: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setPos(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    function dismiss() {
      setPos(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [pos]);

  const clamped = pos
    ? {
        left: Math.max(8, Math.min(pos.x, window.innerWidth - MENU_W - 8)),
        top: Math.max(8, Math.min(pos.y, window.innerHeight - MENU_H - 8)),
      }
    : null;

  return (
    <div
      className={className}
      onContextMenu={(e) => {
        e.preventDefault();
        setPos({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
      {pos && clamped
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: "fixed", top: clamped.top, left: clamped.left }}
              className="msg-rise z-50 w-52 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]"
            >
              <ThreadMenuItems {...menuProps} onClose={() => setPos(null)} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
