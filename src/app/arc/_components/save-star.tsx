"use client";

import { useState } from "react";

import { cx } from "@/app/_components/theme";
import { saveArcItemAction, unsaveArcItemAction, type SaveItemActionInput } from "../actions";

/** A small ⭐ toggle. `savedId` (if provided) means already-saved; clicking removes it.
 *  Otherwise clicking saves and flips to saved. Optimistic; silent on failure. */
export function SaveStar({ input, savedId, label = "Save" }: { input: SaveItemActionInput; savedId?: string | null; label?: string }) {
  const [id, setId] = useState<string | null>(savedId ?? null);
  const [busy, setBusy] = useState(false);
  const saved = id !== null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (saved && id) {
        const prev = id;
        setId(null);
        await unsaveArcItemAction(prev);
      } else {
        const res = await saveArcItemAction(input);
        if (res.ok && res.id) setId(res.id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Saved — click to remove" : label}
      title={saved ? "Saved" : label}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition hover:bg-[var(--surface-inset)]",
        saved ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      )}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 14l-4.5 2.4.9-5L2.8 7.8l5-.7z" />
      </svg>
    </button>
  );
}
