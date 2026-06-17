"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AgentNameProvider } from "./agent-name-context";
import { BackgroundGradientAnimation } from "./background-gradient-animation";
import { DottedSurface } from "./dotted-surface";
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

function BrandArc({ brand }: { brand: ConsoleBrand }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-sm font-semibold text-[var(--accent)]"
      aria-hidden
    >
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-configured logo may be external or data URL.
        <img alt="" className="h-full w-full object-contain" src={brand.logoUrl} />
      ) : (
        brand.shortName
      )}
    </span>
  );
}

function BrandWordmark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- transparent generated wordmark served from /public.
    <img
      alt=""
      className="h-8 w-auto max-w-[112px] select-none object-contain object-left"
      draggable={false}
      src="/brand/arc-wordmark.png"
    />
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
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc", "/"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
    { label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] },
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
    { label: "CRM", href: "/crm", icon: "crm", matches: ["/crm"] },
    { label: "Brain", href: "/brain", icon: "brain", matches: ["/brain"] },
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
  ];

  const settingsNavItems: ShellNavItem[] = [
    { label: "Settings", href: "/settings?section=branding", icon: "settings", matches: ["/settings"] },
  ];

  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/forgot-password") {
    return <AgentNameProvider value={agentName}>{children}</AgentNameProvider>;
  }

  const expanded = isSidebarExpanded({ pinned: false, hovered, focusWithin });
  const collapsed = !expanded;

  const layout = cx(
    "flex min-h-[100dvh] flex-col lg:grid lg:h-screen lg:min-h-0",
    "lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:lg:transition-none",
    expanded ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[72px_minmax(0,1fr)]",
  );

  return (
    <AgentNameProvider value={agentName}>
      <main className={theme.shell.canvas}>
        <div className={layout}>
        <aside
          className={cx(
            theme.shell.sidebar,
            "sticky top-0 z-40 flex h-16 shrink-0 items-center gap-1 overflow-hidden px-2 py-2 lg:relative lg:h-screen lg:items-stretch lg:gap-0 lg:overflow-hidden lg:px-4 lg:py-5",
          )}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocusWithin(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
          }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <BackgroundGradientAnimation />
            {/* Readability scrim: fade the gradient toward the sidebar tone so nav
                labels and the gold active-indicator stay legible. */}
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_20%,transparent,var(--surface-sidebar)_88%)]" />
            <div className="absolute inset-0 bg-[var(--surface-sidebar)] opacity-40" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1 lg:min-h-0 lg:flex-col lg:items-stretch lg:gap-3 lg:overflow-y-auto">
            <Link
              href="/arc"
              className={cx(
                "group flex shrink-0 items-center gap-3 px-0.5 leading-none transition hover:opacity-90 lg:mb-2 lg:px-1.5",
                collapsed && "lg:justify-center lg:gap-0 lg:px-0",
              )}
              aria-label={`${brand.workspaceName} ${brand.productLabel} - go to home`}
              title={`${brand.workspaceName} ${brand.productLabel}`}
            >
              <BrandArc brand={brand} />
              <span
                className={cx(
                  "hidden min-w-0 max-w-[130px] overflow-hidden opacity-100 transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none lg:flex",
                  collapsed && "lg:max-w-0 lg:-translate-x-1 lg:opacity-0",
                )}
              >
                <BrandWordmark />
              </span>
            </Link>

            <SideNav active={pathname} items={navItems} collapsed={collapsed} mobileDock />
          </div>

          <div className={cx("shrink-0 border-l pl-1 lg:mt-2 lg:border-l-0", theme.surface.divider, "lg:border-t lg:pl-0 lg:pt-3")}>
            <SideNav active={pathname} items={settingsNavItems} collapsed={collapsed} mobileDock />
          </div>

          <OperatorProfile collapsed={collapsed} />
        </aside>

        {pathname.startsWith("/arc") ? (
          <section className="min-w-0 min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden">
            <ShellContent>{children}</ShellContent>
          </section>
        ) : (
          // Ambient dotted backdrop sits behind the content column (not the Arc
          // surface, which keeps its own visuals). `relative isolate` keeps the
          // -z-10 field above the page canvas but below content; the inner div
          // owns the scroll so the backdrop stays put as the page scrolls.
          <section className="relative isolate min-w-0 min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden">
            <DottedSurface />
            <div className="px-4 py-4 sm:px-6 lg:h-full lg:overflow-y-auto lg:px-8 lg:py-5 xl:px-10">
              <ShellContent>{children}</ShellContent>
            </div>
          </section>
        )}
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
        <div
          className={cx(
            "min-w-0 max-w-[180px] flex-1 overflow-hidden opacity-100 transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            collapsed && "lg:max-w-0 lg:-translate-x-1 lg:opacity-0",
          )}
        >
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Evan</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">Operator</div>
        </div>
      </div>
    </div>
  );
}
