"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import { nodeProvenance } from "@/domain";
import type { BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

/** ⌘K / Ctrl+K fuzzy jump to any fact. Opens on the shortcut; Enter selects. */
export function BrainQuickSwitcher({ nodes, onSelect }: { nodes: BrainNode[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => { setQuery(""); setActive(0); });
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? nodes.filter((n) => n.label.toLowerCase().includes(q)) : nodes;
    return list.slice(0, 30);
  }, [query, nodes]);

  useEffect(() => {
    void Promise.resolve().then(() => setActive((a) => Math.min(a, Math.max(0, results.length - 1))));
  }, [results.length]);

  if (!open) return null;

  const choose = (n: BrainNode | undefined) => {
    if (!n) return;
    onSelect(n.id);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[18vh]" role="dialog" aria-modal="true" aria-label="Jump to a fact">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-3">
          <span className="font-mono text-xs text-[var(--accent)]">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a fact…"
            aria-label="Search facts"
            role="combobox"
            aria-expanded={true}
            aria-controls="brain-qs-list"
            aria-activedescendant={results[active] ? `brain-qs-opt-${results[active].id}` : undefined}
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
              else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
            }}
          />
          <span className="hidden shrink-0 rounded border border-[var(--border-hairline)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">esc</span>
        </div>
        <ul id="brain-qs-list" role="listbox" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No matching facts</li>
          ) : (
            results.map((n, i) => (
              <li key={n.id} id={`brain-qs-opt-${n.id}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(n)}
                  className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", i === active ? "bg-[var(--surface-inset)]" : "hover:bg-[var(--surface-inset)]")}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SOURCE_DOT[nodeProvenance(n).system] }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{n.label}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-[var(--text-muted)]">{n.kind.replace(/_/g, " ")}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
