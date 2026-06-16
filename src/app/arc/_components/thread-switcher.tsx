"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/app/_components/theme";
import type { ArcConversation, ArcProject } from "@/lib/arc-chat/persistence";

type SwitcherItem = {
  key: string;
  label: string;
  subtitle: string;
  href: string;
};

/** Cmd/Ctrl+K palette for jumping between Arc threads without the mouse. */
export function ThreadSwitcher({
  conversations,
  projects,
  activeId,
}: {
  conversations: ArcConversation[];
  projects: ArcProject[];
  activeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setIndex(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const items = useMemo<SwitcherItem[]>(() => {
    const threads: SwitcherItem[] = conversations.map((c) => ({
      key: c.id,
      label: c.title,
      subtitle: c.id === activeId ? "Current" : c.projectId ? projectName.get(c.projectId) ?? "Project" : "Chat",
      href: `/arc?c=${c.id}`,
    }));
    const all: SwitcherItem[] = [
      { key: "new", label: "New chat", subtitle: "Start fresh", href: "/arc" },
      ...threads,
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 9);
    return all.filter((it) => `${it.label} ${it.subtitle}`.toLowerCase().includes(q)).slice(0, 9);
  }, [conversations, activeId, projectName, query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Switch thread">
      <div className="lightbox-backdrop absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="lightbox-panel absolute left-1/2 top-[16vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const it = items[index];
              if (it) go(it.href);
            }
          }}
          placeholder="Jump to a chat…"
          aria-label="Jump to a chat"
          className="h-11 w-full border-b border-[var(--border-hairline)] bg-transparent px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none"
        />
        <div className="max-h-80 overflow-y-auto p-1.5" role="listbox" aria-label="Chats">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-muted)]">No matches.</p>
          ) : (
            items.map((it, i) => (
              <button
                key={it.key}
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(it.href)}
                className={cx(
                  "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                  i === index ? "bg-[var(--surface-inset)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{it.subtitle}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
          <span><span className="font-mono">↑↓</span> navigate</span>
          <span><span className="font-mono">↵</span> open</span>
          <span><span className="font-mono">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
