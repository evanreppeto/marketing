"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import { filterCommands, type SlashCommand } from "./slash-commands";

/** ⌘K command palette. Self-contained: filters SLASH_COMMANDS and calls
 *  onSelect with the chosen command. Keyboard: ↑/↓ move, Enter apply, Esc close. */
export function CommandPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => filterCommands(query), [query]);

  // Reset + focus each time it opens. setState is deferred to satisfy the
  // set-state-in-effect lint rule (same pattern as arc-chat.tsx).
  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => {
      setQuery("");
      setActive(0);
    });
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  // Keep the active index in range as results shrink.
  useEffect(() => {
    void Promise.resolve().then(() => {
      setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
    });
  }, [results.length]);

  if (!open) return null;

  function choose(cmd: SlashCommand | undefined) {
    if (!cmd) return;
    onSelect(cmd);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        className="lightbox-backdrop absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="lightbox-panel relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-3">
          <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4h10M5 10h10M5 16h6" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Run a command…"
            aria-label="Search commands"
            aria-controls={listId}
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
          />
          <span className="hidden shrink-0 rounded border border-[var(--border-hairline)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">esc</span>
        </div>

        <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No matching commands</li>
          ) : (
            results.map((c, i) => (
              <li key={c.cmd} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                    i === active ? "bg-[var(--surface-inset)]" : "hover:bg-[var(--surface-inset)]",
                  )}
                >
                  <span className="font-mono text-xs font-semibold text-[var(--accent-contrast)]">{c.cmd}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{c.label}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{c.hint}</span>
                  </span>
                  {i === active ? (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">↵</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
