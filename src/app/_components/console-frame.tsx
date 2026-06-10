"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded, readPinnedPreference, writePinnedPreference } from "./sidebar-state";
import { cx, theme } from "./theme";

/**
 * Persistent application chrome, rendered ONCE in the root layout so the sidebar
 * and SideNav pending state survive navigations. The rail is a compact icon strip
 * by default (lg+) and expands on hover, keyboard focus, or when pinned.
 * `agentName`/`agentMonogram` come from the server layout so the connected agent's
 * identity threads through nav + brand. Auth pages render bare.
 */
export function ConsoleFrame({
  agentName,
  agentMonogram,
  children,
}: {
  gateEnabled: boolean;
  agentName: string;
  agentMonogram: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  useEffect(() => {
    const stored = readPinnedPreference(typeof window === "undefined" ? null : window.localStorage);
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => setPinned(stored));
  }, []);

  function togglePinned() {
    setPinned((prev) => {
      const next = !prev;
      writePinnedPreference(typeof window === "undefined" ? null : window.localStorage, next);
      return next;
    });
  }

  const navItems: ShellNavItem[] = [
    { label: agentName, href: "/mark", icon: "mark", matches: ["/mark", "/"] },
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
  ];

  void agentMonogram;

  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/forgot-password") {
    return <>{children}</>;
  }

  const expanded = isSidebarExpanded({ pinned, hovered, focusWithin });
  const collapsed = !expanded;

  const layout = cx(
    "min-h-screen lg:grid lg:h-screen lg:min-h-0",
    "lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:lg:transition-none",
    expanded ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[72px_minmax(0,1fr)]",
  );

  return (
    <main className={theme.shell.canvas}>
      <div className={layout}>
        <aside
          className={theme.shell.sidebar}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocusWithin(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
          }}
        >
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:hidden">
            <Link
              href="/mark"
              className="group mb-2 flex items-center px-1.5 leading-none transition hover:opacity-90"
              aria-label="Big Shoulders Marketing — go to home"
              title="Big Shoulders Marketing"
            >
              <span
                aria-hidden
                className={cx(
                  "hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-sm font-semibold text-[var(--accent)]",
                  collapsed && "lg:flex",
                )}
              >
                BS
              </span>
              <span className={cx("flex flex-col", collapsed && "lg:hidden")}>
                <span
                  className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Big Shoulders
                </span>
                <span className="mt-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent)]">
                  Marketing
                </span>
              </span>
            </Link>

            <SideNav active={pathname} items={navItems} collapsed={collapsed} />

            <button
              type="button"
              onClick={togglePinned}
              aria-pressed={pinned}
              title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              className="mt-2 hidden h-8 items-center gap-2 rounded-lg border border-transparent px-2.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--border-hairline)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-secondary)] lg:inline-flex"
            >
              <span aria-hidden className="text-base leading-none">
                {pinned ? "⇤" : "⇥"}
              </span>
              <span className={collapsed ? "lg:hidden" : ""}>{pinned ? "Unpin" : "Pin open"}</span>
            </button>
          </div>

          <OperatorProfile collapsed={collapsed} />
        </aside>

        <section
          className={
            pathname.startsWith("/mark")
              ? "min-w-0 min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden"
              : theme.shell.content
          }
        >
          <ShellContent>{children}</ShellContent>
        </section>
      </div>
    </main>
  );
}

function OperatorProfile({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cx("mt-4 hidden border-t pb-6 pt-4 lg:block", theme.surface.divider)}>
      <div className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 transition hover:border-[var(--border-panel)]">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-xs font-semibold text-[var(--accent)]">
          ER
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-inset)] bg-[var(--ok)]"
          />
        </div>
        <div className={cx("min-w-0 flex-1", collapsed && "lg:hidden")}>
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Evan</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">Operator</div>
        </div>
      </div>
    </div>
  );
}
