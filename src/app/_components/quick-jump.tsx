"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { navItems } from "../_data/growth-engine";
import { cx, theme } from "./theme";

type JumpItem = {
  key: string;
  label: string;
  subtitle: string;
  href: string;
};

const crmSubroutes: Array<{ label: string; href: string }> = [
  { label: "Companies", href: "/crm/companies" },
  { label: "Contacts", href: "/crm/contacts" },
  { label: "Properties", href: "/crm/properties" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Jobs", href: "/crm/jobs" },
  { label: "Outcomes", href: "/crm/outcomes" },
];

function buildItems(): JumpItem[] {
  return [
    ...navItems.map((item) => ({
      key: `nav:${item.href}`,
      label: item.label,
      subtitle: "Section",
      href: item.href,
    })),
    ...crmSubroutes.map((item) => ({
      key: `crm:${item.href}`,
      label: item.label,
      subtitle: "CRM object",
      href: item.href,
    })),
  ];
}

export function QuickJump() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = useMemo(() => buildItems(), []);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 10);
    return allItems
      .filter((item) => `${item.label} ${item.subtitle}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allItems, query]);

  const selectedIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          const nextOpen = !value;
          if (nextOpen) {
            setQuery("");
            setActiveIndex(0);
          }
          return nextOpen;
        });
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(items.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[selectedIndex];
      if (item) {
        setOpen(false);
        router.push(item.href);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActiveIndex(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded px-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label="Open quick jump (Ctrl or Cmd + K)"
      >
        <kbd className="hidden items-center gap-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline-flex">
          <span>⌘</span>
          <span>K</span>
        </kbd>
        <span className="hidden sm:inline">Quick jump</span>
      </button>

      {open ? (
        <div
          className={cx(theme.shell.overlay, "flex items-start justify-center px-4 pt-[12vh]")}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="signal-panel w-full max-w-lg overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Quick jump"
          >
            <div className="border-b border-[var(--border-hairline)] px-3 py-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleInputKey}
                placeholder="Jump to a section or CRM object…"
                className="w-full bg-transparent px-1 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                aria-label="Search"
              />
            </div>

            <ul className="max-h-[55vh] overflow-y-auto py-1" role="listbox">
              {items.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  No matches for &ldquo;{query}&rdquo;.
                </li>
              ) : (
                items.map((item, index) => {
                  const isActive = index === selectedIndex;
                  return (
                    <li key={item.key} role="option" aria-selected={isActive}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex items-baseline justify-between gap-3 px-4 py-2 text-sm transition ${
                          isActive
                            ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
                        }`}
                      >
                        <span className="font-medium">{item.label}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">{item.subtitle}</span>
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex items-center justify-between border-t border-[var(--border-hairline)] bg-[var(--canvas-deep)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className={theme.control.kbd}>↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className={theme.control.kbd}>↵</kbd> jump
                </span>
                <span>
                  <kbd className={theme.control.kbd}>esc</kbd> close
                </span>
              </div>
              <span>
                {items.length} result{items.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
