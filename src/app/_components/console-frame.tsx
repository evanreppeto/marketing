"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { cx, theme } from "./theme";

const navItems: ShellNavItem[] = [
  { label: "Mark", href: "/mark", icon: "mark", matches: ["/mark", "/"] },
  { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
  { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
];

/**
 * The persistent application chrome. Rendered ONCE in the root layout so the
 * sidebar and SideNav's pending state survive navigations; only the page
 * content swaps. Auth pages opt out and render
 * bare (it provides its own full-screen layout). `gateEnabled` comes from the
 * server layout because the operator gate reads server-only env.
 */
export function ConsoleFrame({ children }: { gateEnabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/forgot-password") {
    return <>{children}</>;
  }

  return (
    <main className={theme.shell.canvas}>
      <div className={theme.shell.layout}>
        <aside className={theme.shell.sidebar}>
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:hidden">
            <Link
              href="/mark"
              className="group mb-2 flex flex-col px-1.5 leading-none transition hover:opacity-90"
              aria-label="Big Shoulders Marketing — go to Mark"
            >
              <span
                className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Big Shoulders
              </span>
              <span className="mt-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent)]">
                Marketing
              </span>
            </Link>

            <SideNav active={pathname} items={navItems} />
          </div>

          <OperatorProfile />
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

function OperatorProfile() {
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Evan</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">Operator</div>
        </div>
      </div>
    </div>
  );
}
