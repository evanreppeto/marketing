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

  // Focus mode: on the Mark chat the nav collapses to a slim, always-visible icon
  // rail that expands to the full labelled panel on hover or keyboard focus,
  // floating over the chat. The whole rail is the hover target — no hunting for
  // the edge. Desktop only (lg+); on mobile it stays the normal top strip.
  const isMark = pathname.startsWith("/mark");

  const markRailAside =
    "border-b border-[var(--border-panel)] bg-[var(--surface-sidebar)] px-4 py-3 " +
    "group/rail lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:h-screen lg:min-h-0 lg:flex-col " +
    "lg:border-b-0 lg:border-r lg:py-5 lg:px-2 lg:w-[64px] lg:overflow-x-hidden " +
    "lg:transition-[width,padding,box-shadow] lg:duration-200 lg:ease-out " +
    "lg:hover:w-[280px] lg:focus-within:w-[280px] lg:hover:px-4 lg:focus-within:px-4 " +
    "lg:hover:shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)] lg:focus-within:shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)]";

  return (
    <main className={theme.shell.canvas}>
      <div className={isMark ? "min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden" : theme.shell.layout}>
        <aside className={isMark ? markRailAside : theme.shell.sidebar}>
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:hidden">
            {isMark ? (
              <Link
                href="/mark"
                className="mb-2 flex items-center gap-2.5 px-1 leading-none transition hover:opacity-90"
                aria-label="Big Shoulders Marketing — go to Mark"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[0.75rem] font-bold text-[var(--accent-strong)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  BS
                </span>
                <span className="flex min-w-0 flex-col whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
                  <span
                    className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    Big Shoulders
                  </span>
                  <span className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent)]">
                    Marketing
                  </span>
                </span>
              </Link>
            ) : (
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
            )}

            <SideNav active={pathname} items={navItems} collapsible={isMark} />
          </div>

          <OperatorProfile rail={isMark} />
        </aside>

        <section
          className={
            isMark
              ? "min-w-0 min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden lg:pl-[64px]"
              : theme.shell.content
          }
        >
          <ShellContent>{children}</ShellContent>
        </section>
      </div>
    </main>
  );
}

function OperatorProfile({ rail = false }: { rail?: boolean }) {
  // In the collapsed rail the chip is just a centered avatar; its border/background
  // and the name only appear once the rail expands (hover/focus), so nothing clips
  // at the narrow width.
  const railChrome =
    "justify-center px-0 " +
    "lg:group-hover/rail:justify-start lg:group-hover/rail:rounded-lg lg:group-hover/rail:border lg:group-hover/rail:border-[var(--border-hairline)] lg:group-hover/rail:bg-[var(--surface-inset)] lg:group-hover/rail:px-3 " +
    "lg:group-focus-within/rail:justify-start lg:group-focus-within/rail:rounded-lg lg:group-focus-within/rail:border lg:group-focus-within/rail:border-[var(--border-hairline)] lg:group-focus-within/rail:bg-[var(--surface-inset)] lg:group-focus-within/rail:px-3";

  return (
    <div className={cx("mt-4 hidden border-t pb-6 pt-4 lg:block", theme.surface.divider)}>
      <div
        className={cx(
          "flex items-center gap-3 py-2.5 transition",
          rail ? railChrome : "rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 hover:border-[var(--border-panel)]",
        )}
      >
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-xs font-semibold text-[var(--accent)]">
          ER
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-inset)] bg-[var(--ok)]"
          />
        </div>
        <div
          className={cx(
            "min-w-0 flex-1",
            rail && "whitespace-nowrap opacity-0 transition-opacity duration-200 lg:group-hover/rail:opacity-100 lg:group-focus-within/rail:opacity-100",
          )}
        >
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Evan</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">Operator</div>
        </div>
      </div>
    </div>
  );
}
