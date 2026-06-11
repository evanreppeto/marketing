"use client";

import { useEffect, useState } from "react";

import { createTaskAction } from "./actions";
import { buttonClasses } from "../_components/page-header";

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);

  // Esc closes; lock body scroll while the dialog is up.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        className={buttonClasses({ variant: "primary", className: "gap-1.5" })}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span aria-hidden className="text-base leading-none">+</span>
        New task
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          onClick={() => setOpen(false)}
        >
          <form
            action={createTaskAction}
            className="w-full max-w-md rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--text-primary)]">New task for Mark</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Queues onto the board. Mark prepares — outbound stays locked behind approval.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Objective
                <textarea
                  autoFocus
                  className="mt-1.5 h-24 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2.5 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  name="objective"
                  placeholder="Enrich 20 plumbing partner leads in 606xx ZIPs…"
                  required
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Priority
                <select
                  className="mt-1.5 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--text-primary)]"
                  defaultValue="medium"
                  name="priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border-hairline)] px-5 py-4">
              <button className={buttonClasses({ variant: "ghost" })} onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button className={buttonClasses({ variant: "primary" })} type="submit">
                Queue task
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
