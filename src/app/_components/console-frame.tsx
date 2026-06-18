"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PlusIcon, Settings2 } from "lucide-react";

import { AgentNameProvider } from "./agent-name-context";
import { BackgroundGradientAnimation } from "./background-gradient-animation";
import { NavIcon } from "./nav-icons";
import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded } from "./sidebar-state";
import { cx, theme } from "./theme";
import FlowFieldBackground from "@/components/ui/flow-field-background";
import { Workspaces, WorkspaceContent, WorkspaceTrigger, type Workspace } from "@/components/ui/workspaces";

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

  const homeNavItems: ShellNavItem[] = [
    { label: "Home", href: "/", icon: "home", matches: ["/"], exact: true },
  ];

  const growthNavItems: ShellNavItem[] = [
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
    { label: "CRM", href: "/crm", icon: "crm", matches: ["/crm"] },
    { label: "Opportunities", href: "/opportunities", icon: "opportunities", matches: ["/opportunities"] },
  ];

  const intelligenceNavItems: ShellNavItem[] = [
    { label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] },
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
    { label: "Brain", href: "/brain", icon: "brain", matches: ["/brain"] },
  ];

  const assetNavItems: ShellNavItem[] = [
    { label: "Gallery", href: "/gallery", icon: "gallery", matches: ["/gallery"] },
    { label: "Library", href: "/library", icon: "library", matches: ["/library"] },
    { label: "Outbox", href: "/outbox", icon: "outbox", matches: ["/outbox"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
  ];

  const navItems: ShellNavItem[] = [
    homeNavItems[0],
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc"] },
    ...growthNavItems,
    ...intelligenceNavItems,
    ...assetNavItems,
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

              <ArcCommandLink active={pathname.startsWith("/arc")} agentName={agentName} collapsed={sidebarCollapsed} />

              <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                <div className="flex flex-col gap-3">
                  <SidebarSection collapsed={sidebarCollapsed} label="Workspace">
                    <SideNav active={pathname} items={homeNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} label="Growth">
                    <SideNav active={pathname} items={growthNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} label="Intelligence">
                    <SideNav active={pathname} items={intelligenceNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} label="Assets">
                    <SideNav active={pathname} items={assetNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>
                </div>
              </div>

              <SidebarWorkspaceSwitcher collapsed={sidebarCollapsed} workspaceName={brand.workspaceName} />

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

function ArcCommandLink({
  active,
  agentName,
  collapsed,
}: {
  active: boolean;
  agentName: string;
  collapsed?: boolean;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={`${agentName} command center`}
      className={cx(
        "group relative flex shrink-0 items-center rounded transition duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
        collapsed
          ? "mx-auto h-10 w-10 justify-center"
          : "min-h-11 gap-2.5 px-2.5",
        active
          ? "bg-[rgba(255,255,255,0.055)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
      )}
      href="/arc"
      prefetch
    >
      <NavIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" name="arc" />
      {!collapsed ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-current">{agentName}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
            Live
          </span>
        </span>
      ) : null}
      {active ? (
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute rounded-full bg-[color-mix(in_srgb,var(--accent)_62%,transparent)]",
            collapsed ? "inset-x-3 -bottom-px h-px" : "inset-y-2 right-2 w-px",
          )}
        />
      ) : null}
    </Link>
  );
}

function SidebarWorkspaceSwitcher({ collapsed, workspaceName }: { collapsed?: boolean; workspaceName: string }) {
  const workspaces: Workspace[] = [
    {
      id: "current",
      name: workspaceName,
      plan: "Company workspace",
    },
  ];

  return (
    <div className="border-t border-[var(--border-hairline)] pt-3">
      {!collapsed ? (
        <div className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Workspace
        </div>
      ) : null}
      <Workspaces workspaces={workspaces} selectedWorkspaceId="current">
        <WorkspaceTrigger collapsed={collapsed} />
        <WorkspaceContent align={collapsed ? "center" : "start"} side={collapsed ? "right" : "top"} sideOffset={10} title="Workspaces">
          <Link
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            href="/settings?section=workspace"
          >
            <Settings2 aria-hidden className="h-4 w-4 text-[var(--text-muted)]" />
            Manage workspace
          </Link>
          <Link
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            href="/onboarding"
          >
            <PlusIcon aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Create workspace
          </Link>
        </WorkspaceContent>
      </Workspaces>
    </div>
  );
}

function SidebarSection({
  children,
  collapsed,
  label,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
  label?: string;
}) {
  return (
    <section className={cx("min-w-0", collapsed ? "pt-1" : "space-y-1.5 border-t border-[var(--border-hairline)] pt-3")} aria-label={label}>
      {!collapsed && label ? (
        <div className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {label}
        </div>
      ) : null}
      {children}
    </section>
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
