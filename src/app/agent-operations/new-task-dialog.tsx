"use client";

import { useState } from "react";

import { createTaskAction } from "./actions";
import { buttonClasses } from "../_components/page-header";

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={buttonClasses({ variant: "primary" })} onClick={() => setOpen(true)} type="button">
        + New task
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          onClick={() => setOpen(false)}
        >
          <form
            action={createTaskAction}
            className="w-full max-w-md rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-5 shadow-[var(--elev-raised)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">New task for Mark</h2>
            <label className="mt-4 block text-sm font-semibold text-[var(--text-secondary)]">
              Objective
              <textarea
                className="mt-1 h-24 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2 text-sm text-[var(--text-primary)]"
                name="objective"
                placeholder="Enrich 20 plumbing partner leads in 606xx ZIPs…"
                required
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-[var(--text-secondary)]">
              Priority
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2 text-sm text-[var(--text-primary)]"
                defaultValue="medium"
                name="priority"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
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
