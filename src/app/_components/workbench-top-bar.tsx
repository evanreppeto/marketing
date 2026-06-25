"use client";

import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";

import { useCommandMenu } from "./command-menu";
import { useWorkspaceName } from "./workspace-name-context";

/**
 * Desktop workbench header bar, rendered once app-wide by the shell. Controls:
 * - the workspace chip links to workspace settings and reflects the real name
 * - the command box (and Ctrl/Cmd+K) opens the shared command palette
 * - `actions` render on the right (optional page-level actions)
 * - `avatar` renders far right (the operator avatar, passed by the shell)
 */
export function WorkbenchTopBar({
  actions,
  avatar,
}: {
  actions?: React.ReactNode;
  avatar?: React.ReactNode;
}) {
  const workspaceName = useWorkspaceName();
  const commandMenu = useCommandMenu();

  return (
    <div className="mb-5 hidden min-h-12 items-center gap-3 rounded-[12px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-sidebar)_76%,transparent)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl lg:flex">
      <Link
        href="/settings?section=workspace"
        className="flex min-w-[15rem] items-center gap-2 rounded-[7px] px-1.5 py-1 text-sm font-semibold text-[var(--text-primary)] transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        title="Manage workspace"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.6} />
        <span className="truncate">{workspaceName}</span>
      </Link>

      <button
        type="button"
        onClick={commandMenu.open}
        aria-label="Open command palette"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-8 min-w-[18rem] flex-1 items-center gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_72%,transparent)] px-3 text-left text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--accent-border)] hover:text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <Search aria-hidden className="h-4 w-4" strokeWidth={1.6} />
        <span className="min-w-0 flex-1 truncate text-sm">Search or jump to…</span>
        <span className="rounded border border-[var(--border-hairline)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          Ctrl K
        </span>
      </button>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}

      {avatar ? <div className="ml-1 shrink-0">{avatar}</div> : null}
    </div>
  );
}
