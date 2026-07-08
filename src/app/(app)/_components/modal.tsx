"use client";

import { useEffect, useId, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Rendered in the sticky footer, right-aligned (e.g. Cancel + a submit button). */
  footer?: React.ReactNode;
  /** Constrain the card width. Defaults to a comfortable form width. */
  width?: number;
  children: React.ReactNode;
};

/**
 * The app's one reusable modal. There was no dialog/overlay primitive before
 * this — every "create new" button was a dead no-op. Open/Escape/click-outside
 * behavior mirrors account-menu.tsx (the only prior floating panel); styling
 * lives in arc-app.css (.modal-*). Rendered inline (no portal) as a
 * position:fixed overlay above the whole shell, which is enough here and keeps
 * it SSR-safe. When open it locks body scroll and moves focus into the card.
 */
export function Modal({ open, onClose, title, description, footer, width, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // Lock background scroll while the modal owns the screen.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the card so keyboard + screen readers land inside the dialog.
    const focusTarget = cardRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
    );
    focusTarget?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        ref={cardRef}
        style={width ? { maxWidth: width } : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            {description && (
              <p className="modal-desc" id={descId}>
                {description}
              </p>
            )}
          </div>
          <button type="button" className="modal-x" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
