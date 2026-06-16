"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/app/_components/theme";

/** Generic right-anchored slide-over. role=dialog, Escape + backdrop close,
 *  focus moves to the panel on open. CSS-only; mirrors the Arc agent drawer. */
export function WorkspaceDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label={`Close ${title}`} className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          "relative flex h-full w-full max-w-[640px] flex-col overflow-hidden border-l border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] outline-none",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
