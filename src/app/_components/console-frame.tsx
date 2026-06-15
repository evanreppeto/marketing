"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AgentNameProvider } from "./agent-name-context";
import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded } from "./sidebar-state";
import { cx, theme } from "./theme";

type ConsoleBrand = {
  workspaceName: string;
  productLabel: string;
  shortName: string;
  logoUrl: string;
};

function BrandMark({ brand }: { brand: ConsoleBrand }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-sm font-semibold text-[var(--accent)]"
      aria-hidden
    >
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-configured logo may be external or data URL.
        <img alt="" className="h-full w-full object-contain p-1" src={brand.logoUrl} />
      ) : (
        brand.shortName
      )}
    </span>
  );
}

/**
 * Persistent application chrome, rendered ONCE in the root layout so the sidebar
 * and SideNav pending state survive navigations. The rail is a compact icon strip
 * by default (lg+) and expands on hover or keyboard focus.
 * Brand and agent identity come from the server layout. Auth pages render bare.
 */
export function ConsoleFrame({
  agentName,
  brand,
  children,
}: {
  agentName: string;
  brand: ConsoleBrand;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  const navItems: ShellNavItem[] = [
    { label: agentName, href: "/mark", icon: "mark", matches: ["/mark", "/"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
    { label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] },
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
  ];

  const settingsNavItems: ShellNavItem[] = [
    { label: "Settings", href: "/settings?section=branding", icon: "settings", matches: ["/settings"] },
  ];

  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/forgot-password") {
    return <AgentNameProvider value={agentName}>{children}</AgentNameProvider>;
  }

  const expanded = isSidebarExpanded({ pinned: false, hovered, focusWithin });
  const collapsed = !expanded;

  const layout = cx(
    "min-h-screen lg:grid lg:h-screen lg:min-h-0",
    "lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:lg:transition-none",
    expanded ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[72px_minmax(0,1fr)]",
  );

  return (
    <AgentNameProvider value={agentName}>
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
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <Link
              href="/mark"
              className={cx(
                "group mb-2 flex items-center gap-3 px-1.5 leading-none transition hover:opacity-90",
                collapsed && "lg:justify-center lg:gap-0 lg:px-0",
              )}
              aria-label={`${brand.workspaceName} ${brand.productLabel} - go to home`}
              title={`${brand.workspaceName} ${brand.productLabel}`}
            >
              <BrandMark brand={brand} />
              <span className={cx("flex flex-col", collapsed && "lg:hidden")}>
                <span
                  className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {brand.workspaceName}
                </span>
                <span className="mt-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent)]">
                  {brand.productLabel}
                </span>
              </span>
            </Link>

            <SideNav active={pathname} items={navItems} collapsed={collapsed} />
          </div>

          <div className={cx("mt-3 lg:mt-2", theme.surface.divider, "lg:border-t lg:pt-3")}>
            <SideNav active={pathname} items={settingsNavItems} collapsed={collapsed} />
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
    </AgentNameProvider>
  );
}

function OperatorProfile({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cx("mt-4 hidden border-t pb-6 pt-4 lg:block", theme.surface.divider)}>
      <div className={cx("flex items-center gap-3", collapsed && "lg:justify-center")}>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-xs font-semibold text-[var(--accent)]">
          ER
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-sidebar)] bg-[var(--ok)]"
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
