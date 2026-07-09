"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { switchWorkspace } from "../settings/actions";

export type WorkspaceOption = { id: string; name: string; meta: string; active: boolean };

function initials(name: string): string {
  return (
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "A"
  );
}

/**
 * The workspace brand block at the top of the rail — now a real switcher. Click
 * to open a menu of the workspaces the signed-in user belongs to; picking a
 * different one calls the switchWorkspace server action (repoints the active-
 * workspace cookie) then refreshes so the whole app re-tailors. Mirrors
 * AccountMenu's open/close + outside-click/escape behavior. Falls back to the
 * old static block when there's nothing to switch to (offline/misconfigured).
 */
export function WorkspaceSwitcher({
  workspaceName,
  orgName,
  logoUrl = null,
  workspaces,
}: {
  workspaceName: string;
  orgName: string;
  logoUrl?: string | null;
  workspaces: WorkspaceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startSwitch] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const brand = (
    <>
      <span className="mk">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo; next/image would need per-host remotePatterns
          <img src={logoUrl} alt={orgName} />
        ) : (
          initials(orgName)
        )}
      </span>
      <div>
        <div className="nm">{workspaceName}</div>
        <div className="pl">{orgName}</div>
      </div>
    </>
  );

  // Nothing to switch to → keep the plain (non-interactive) block.
  if (workspaces.length === 0) return <div className="ws">{brand}</div>;

  function select(option: WorkspaceOption) {
    if (option.active) {
      setOpen(false);
      return;
    }
    startSwitch(async () => {
      const result = await switchWorkspace({ workspaceId: option.id });
      setOpen(false);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="wswrap" ref={rootRef} data-open={open ? "true" : undefined}>
      <button
        type="button"
        className="ws wsbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {brand}
        <span className="wschev" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className="wsmenu" role="menu">
          <div className="wsmenu-h">Switch workspace</div>
          {workspaces.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`ws-item${option.active ? " on" : ""}`}
              role="menuitem"
              disabled={pending}
              onClick={() => select(option)}
            >
              <span className="ws-item-mk">{initials(option.name)}</span>
              <span className="ws-item-t">
                <span className="nm">{option.name}</span>
                <span className="mt">{option.meta}</span>
              </span>
              {option.active && (
                <svg className="ws-check" viewBox="0 0 24 24" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
              )}
            </button>
          ))}
          <div className="wsmenu-sep" />
          <Link href="/settings" className="ws-item ws-link" role="menuitem" onClick={() => setOpen(false)}>
            <span className="ws-item-mk ws-item-mk-ghost" aria-hidden>
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
            </span>
            <span className="ws-item-t"><span className="nm">Workspace settings</span></span>
          </Link>
        </div>
      )}
    </div>
  );
}
