"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal a11y for the chat's slide-over drawers: when open, move focus into the
 * panel, trap Tab/Shift+Tab inside it, and restore focus to whatever was focused
 * before (the trigger) on close. Attach the returned ref to the dialog panel
 * (give the panel tabIndex={-1} so it can hold focus as a fallback).
 */
export function useDialogA11y<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    const previouslyFocused = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;

    const focusables = () =>
      panel
        ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        : [];

    // Move focus into the dialog on open.
    (focusables()[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        panel?.focus();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger so keyboard users land where they left off.
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return ref;
}
