"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AgentNameProvider } from "./agent-name-context";
import { BackgroundGradientAnimation } from "./background-gradient-animation";
import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded } from "./sidebar-state";
import { cx, theme } from "./theme";
import FlowFieldBackground from "@/components/ui/flow-field-background";

type ConsoleBrand = {
  workspaceName: string;
  productLabel: string;
  shortName: string;
  logoUrl: string;
};

function BrandMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- transparent product mark served from /public.
    <img alt="" className="h-9 w-9 shrink-0 select-none object-contain" draggable={false} src="/brand/arc-mark.png" />
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
 * Persistent application chrome. Desktop uses the command rail; smaller screens
 * keep a compact top dock so core routes remain reachable.
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
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarFocusWithin, setSidebarFocusWithin] = useState(false);
  const sidebarExpanded = isSidebarExpanded({
    focusWithin: sidebarFocusWithin,
    hovered: sidebarHovered,
    pinned: false,
  });
  const sidebarCollapsed = !sidebarExpanded;

  const navItems: ShellNavItem[] = [
    { label: "Home", href: "/", icon: "home", matches: ["/"], exact: true },
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc"] },
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
    { label: "CRM", href: "/crm", icon: "crm", matches: ["/crm"] },
    { label: "Opportunities", href: "/opportunities", icon: "opportunities", matches: ["/opportunities"] },
    { label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] },
    { label: "Gallery", href: "/gallery", icon: "gallery", matches: ["/gallery"] },
    { label: "Library", href: "/library", icon: "library", matches: ["/library"] },
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
    { label: "Outbox", href: "/outbox", icon: "outbox", matches: ["/outbox"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
    { label: "Brain", href: "/brain", icon: "brain", matches: ["/brain"] },
  ];

  const utilityNavItems: ShellNavItem[] = [
    { label: "Settings", href: "/settings?section=branding", icon: "settings", matches: ["/settings"] },
  ];

  if (
    pathname === "/login" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/forgot-password" ||
    pathname === "/onboarding"
  ) {
    return <AgentNameProvider value={agentName}>{children}</AgentNameProvider>;
  }

  return (
    <AgentNameProvider value={agentName}>
      <main className={theme.shell.canvas}>
        <div
          className={cx(
            "flex min-h-[100dvh] flex-col lg:grid lg:h-screen lg:min-h-0 lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out",
            sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)]",
          )}
        >
          <header className="sticky top-0 z-40 flex min-h-[64px] items-center gap-2 overflow-x-auto border-b border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--canvas-deep)_92%,transparent)] px-3 py-2 backdrop-blur lg:hidden">
            <Link
              href="/"
              className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              aria-label={`${brand.workspaceName} ${brand.productLabel} - go to home`}
            >
              <BrandMark />
              <span className="hidden min-w-0 sm:block">
                <BrandWordmark />
                <span className="-mt-0.5 block max-w-[150px] truncate text-[0.69rem] leading-none text-[var(--text-muted)]">
                  {brand.workspaceName}
                </span>
              </span>
            </Link>

            <div className="min-w-0 flex-1">
              <SideNav active={pathname} items={navItems} mobileDock />
            </div>

            <div className="flex min-w-0 items-center">
              <SideNav active={pathname} items={utilityNavItems} collapsed mobileDock />
            </div>
          </header>

          <aside
            className={cx(theme.shell.sidebar, "hidden transition-[padding] duration-200 lg:flex lg:flex-col", sidebarCollapsed ? "lg:px-3" : "")}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setSidebarFocusWithin(false);
              }
            }}
            onFocus={() => setSidebarFocusWithin(true)}
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <BackgroundGradientAnimation
                blendingValue="soft-light"
                containerClassName="opacity-80"
                firstColor="200, 162, 74"
                fourthColor="90, 52, 42"
                secondColor="120, 96, 60"
                size="135%"
                thirdColor="55, 55, 66"
              />
              <div className="absolute inset-0 bg-[radial-gradient(100%_80%_at_25%_8%,rgba(200,162,74,0.08),transparent_46%),linear-gradient(180deg,rgba(16,16,19,0.54),rgba(16,16,19,0.88)_62%,rgba(16,16,19,0.96))]" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className={cx("flex min-h-12 shrink-0 items-center", sidebarCollapsed ? "justify-center" : "")}>
                <Link
                  href="/"
                  className={cx(
                    "flex min-h-12 shrink-0 items-center gap-3 overflow-visible rounded px-1 py-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                    sidebarCollapsed ? "justify-center" : "",
                  )}
                  aria-label={`${brand.workspaceName} ${brand.productLabel} - go to home`}
                >
                  <BrandMark />
                  {!sidebarCollapsed ? (
                    <span className="min-w-0">
                      <BrandWordmark />
                    </span>
                  ) : null}
                </Link>
              </div>

              <div aria-hidden className="h-px bg-[linear-gradient(90deg,rgba(200,162,74,0.36),rgba(255,255,255,0.08),transparent)]" />

              <div className="min-h-0 flex-1 overflow-y-auto">
                <SideNav active={pathname} items={navItems} collapsed={sidebarCollapsed} />
              </div>

              <WorkspaceBadge collapsed={sidebarCollapsed} workspaceName={brand.workspaceName} />

              <div className={cx("border-t pt-3", theme.surface.divider)}>
                <SideNav active={pathname} items={utilityNavItems} collapsed={sidebarCollapsed} />
              </div>

              <OperatorProfile collapsed={sidebarCollapsed} />
            </div>
          </aside>

          {pathname.startsWith("/arc") ? (
            <section className="min-w-0 min-h-[calc(100dvh-64px)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
              <ShellContent>{children}</ShellContent>
            </section>
          ) : (
            <section className="relative isolate min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <FlowFieldBackground
                  className="absolute inset-0 opacity-70"
                  particleCount={520}
                  speed={0.64}
                  trailOpacity={0.13}
                />
                <div className="absolute inset-0 bg-[radial-gradient(90%_65%_at_8%_-8%,rgba(200,162,74,0.12),transparent_50%),radial-gradient(70%_54%_at_105%_0%,rgba(127,184,154,0.06),transparent_48%),linear-gradient(180deg,rgba(22,22,26,0.22),rgba(22,22,26,0.72)_62%,rgba(22,22,26,0.93))]" />
              </div>
              <div className="px-4 py-4 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-5 xl:px-10">
                <ShellContent>{children}</ShellContent>
              </div>
            </section>
          )}
        </div>
      </main>
    </AgentNameProvider>
  );
}

function WorkspaceBadge({ collapsed, workspaceName }: { collapsed?: boolean; workspaceName: string }) {
  if (collapsed) {
    return (
      <div className="border-t border-[var(--border-hairline)] pt-3">
        <div
          title={workspaceName}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-[10px] font-semibold text-[var(--accent)]"
        >
          {workspaceName.slice(0, 2).toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--border-hairline)] pt-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Workspace</div>
      <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{workspaceName}</div>
    </div>
  );
}

function OperatorProfile({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cx("border-t pb-6 pt-4", theme.surface.divider)}>
      <div className={cx("flex items-center gap-3", collapsed ? "justify-center" : "")}>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-xs font-semibold text-[var(--accent)]">
          ER
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-sidebar)] bg-[var(--ok)]"
          />
        </div>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Evan</div>
            <div className="truncate text-[11px] text-[var(--text-muted)]">Operator</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
