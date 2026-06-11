"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cx } from "./theme";

/**
 * App-wide right-click context menu. Wrap any region in <ContextMenu items={…}>;
 * right-clicking it opens a floating menu at the cursor. The native browser menu
 * is suppressed ONLY on wrapped regions — everywhere else right-click is untouched.
 *
 * Different surfaces pass different items, so each thing can have its own actions.
 * Items support sections (label), separators, links, danger styling, disabled,
 * and two-step confirm (e.g. Delete). Keyboard: ↑/↓ to move, Enter to select,
 * Esc to close. Dismisses on outside-click / scroll / resize / blur.
 */

export type ContextMenuItem =
  | { kind: "separator" }
  | { kind: "label"; label: string }
  | {
      kind?: "action";
      label: string;
      icon?: React.ReactNode;
      danger?: boolean;
      disabled?: boolean;
      /** Two-step confirm: first select swaps to `confirmLabel`; second runs `onSelect`. */
      confirmLabel?: string;
      onSelect?: () => void | Promise<void>;
      href?: string;
    };

type Pos = { x: number; y: number };

export function ContextMenu({
  items,
  children,
  className,
  disabled,
}: {
  /** A static list, or a thunk evaluated at open-time (for fresh state). */
  items: ContextMenuItem[] | (() => ContextMenuItem[]);
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [resolved, setResolved] = useState<ContextMenuItem[]>([]);

  const open = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setResolved(typeof items === "function" ? items() : items);
      setPos({ x: e.clientX, y: e.clientY });
    },
    [items, disabled],
  );

  return (
    <div onContextMenu={open} className={className}>
      {children}
      {pos ? <Menu pos={pos} items={resolved} onClose={() => setPos(null)} /> : null}
    </div>
  );
}

function Menu({ pos, items, onClose }: { pos: Pos; items: ContextMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Pos>(pos);
  const [confirming, setConfirming] = useState<number | null>(null);

  // Clamp to the viewport once measured.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let x = pos.x;
    let y = pos.y;
    if (x + width + pad > window.innerWidth) x = Math.max(pad, window.innerWidth - width - pad);
    if (y + height + pad > window.innerHeight) y = Math.max(pad, window.innerHeight - height - pad);
    setCoords({ x, y });
  }, [pos]);

  // Focus the first actionable item for keyboard users.
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>("[data-cm-item]:not([aria-disabled='true'])")?.focus();
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      const focusables = [...el.querySelectorAll<HTMLElement>("[data-cm-item]:not([aria-disabled='true'])")];
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? (idx + 1) % focusables.length
          : (idx - 1 + focusables.length) % focusables.length;
      focusables[next]?.focus();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // capture-phase scroll so nested scrollers also dismiss
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  async function run(item: Extract<ContextMenuItem, { kind?: "action" }>, idx: number) {
    if (item.confirmLabel && confirming !== idx) {
      setConfirming(idx);
      return;
    }
    onClose();
    await item.onSelect?.();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: coords.x, top: coords.y }}
      className="msg-rise z-[1000] min-w-[200px] max-w-[260px] rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]"
    >
      {items.map((item, i) => {
        if (item.kind === "separator") {
          return <div key={i} aria-hidden className="my-1 h-px bg-[var(--border-hairline)]" />;
        }
        if (item.kind === "label") {
          return (
            <div key={i} className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {item.label}
            </div>
          );
        }
        const label = confirming === i && item.confirmLabel ? item.confirmLabel : item.label;
        const cls = cx(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold outline-none transition",
          item.danger
            ? "text-[var(--priority-bright)] hover:bg-[var(--priority-soft)] focus:bg-[var(--priority-soft)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus:bg-[var(--surface-inset)] focus:text-[var(--text-primary)]",
          item.disabled && "pointer-events-none opacity-40",
        );
        if (item.href && !item.disabled) {
          return (
            <Link key={i} href={item.href} role="menuitem" data-cm-item className={cls} onClick={() => onClose()}>
              {item.icon}
              <span className="flex-1 truncate">{label}</span>
            </Link>
          );
        }
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            data-cm-item
            aria-disabled={item.disabled || undefined}
            className={cls}
            onClick={() => run(item, i)}
          >
            {item.icon}
            <span className="flex-1 truncate">{label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
