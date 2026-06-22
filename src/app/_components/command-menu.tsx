"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { navItems } from "../_data/growth-engine";
import { useAgentName } from "./agent-name-context";
import { cx, theme } from "./theme";

type JumpItem = {
  key: string;
  label: string;
  subtitle: string;
  href: string;
};

type CommandMenuContextValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

/** Open the shared command palette from anywhere inside the app shell. */
export function useCommandMenu(): CommandMenuContextValue {
  const value = useContext(CommandMenuContext);
  // No-op fallback so isolated previews/tests that render a consumer without
  // the provider don't crash.
  return value ?? { open: () => {}, close: () => {}, toggle: () => {} };
}

function buildItems(agentName: string): JumpItem[] {
  return navItems.map((item) => ({
    key: `nav:${item.href}`,
    label: item.href === "/arc" ? agentName : item.label,
    subtitle: "Section",
    href: item.href,
  }));
}

/**
 * Mounts the global command palette once and wires the Ctrl/Cmd+K shortcut.
 * Any descendant can trigger it via {@link useCommandMenu}. Previously this
 * lived in an unmounted `QuickJump` component, so the shortcut did nothing and
 * the workbench "Arc command" box was decorative.
 */
export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const agentName = useAgentName();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = useMemo(() => buildItems(agentName), [agentName]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 10);
    return allItems.filter((item) => `${item.label} ${item.subtitle}`.toLowerCase().includes(q)).slice(0, 12);
  }, [allItems, query]);

  const selectedIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  const controls = useMemo<CommandMenuContextValue>(
    () => ({
      open: () => {
        setQuery("");
        setActiveIndex(0);
        setOpen(true);
      },
      close: () => setOpen(false),
      toggle: () =>
        setOpen((value) => {
          const nextOpen = !value;
          if (nextOpen) {
            setQuery("");
            setActiveIndex(0);
          }
          return nextOpen;
        }),
    }),
    [],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        controls.toggle();
        return;
      }
      if (event.key === "Escape") {
        setOpen((value) => {
          if (value) event.preventDefault();
          return false;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controls]);

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
    <CommandMenuContext.Provider value={controls}>
      {children}
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
            aria-label="Command palette"
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
    </CommandMenuContext.Provider>
  );
}
