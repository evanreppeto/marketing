"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Honest feedback for not-yet-wired controls. Any element (on any app screen)
 * marked with `data-soon` shows a quiet, self-dismissing "Coming soon" toast
 * when clicked instead of silently doing nothing — so a preview control reads as
 * intentional, not broken. The attribute's value, when present, is the message;
 * otherwise it falls back to "Coming soon".
 *
 * One delegated listener covers the whole app, so marking a control is a
 * one-attribute change. Mounted once in the AppShell.
 */
type SoonToast = { id: number; label: string };

const DEFAULT_LABEL = "Coming soon";
const VISIBLE_MS = 2600;

export function ComingSoonToasts() {
  const [toasts, setToasts] = useState<SoonToast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-soon]");
      if (!trigger) return;
      event.preventDefault();

      const label = trigger.getAttribute("data-soon")?.trim() || DEFAULT_LABEL;
      const id = ++seq.current;
      setToasts((current) => [...current, { id, label }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, VISIBLE_MS);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="soon-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="soon-toast">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {toast.label}
        </div>
      ))}
    </div>
  );
}
