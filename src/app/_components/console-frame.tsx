"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Cog, MoreHorizontal, PlusIcon } from "lucide-react";

import { switchWorkspaceAction } from "../settings/workspace-actions";

import { AgentNameProvider } from "./agent-name-context";
import { BackgroundGradientAnimation } from "./background-gradient-animation";
import { NavIcon } from "./nav-icons";
import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded } from "./sidebar-state";
import { cx, theme } from "./theme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FlowFieldBackground from "@/components/ui/flow-field-background";
import { Workspaces, WorkspaceContent, WorkspaceTrigger, type Workspace } from "@/components/ui/workspaces";

type ConsoleBrand = {
  workspaceName: string;
  productLabel: string;
  shortName: string;
  logoUrl: string;
};

type OperatorShellProfile = {
  avatarUrl: string | null;
  email: string | null;
  name: string;
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

const sidebarGoldDividerTop =
  "relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] before:opacity-50 before:content-['']";
const sidebarGoldDividerBottom =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] after:opacity-35 after:content-['']";
const sidebarBottomDock =
  "relative mt-1 rounded-xl border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-soft)_58%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] before:absolute before:inset-x-3 before:-top-px before:h-px before:bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_72%,transparent),color-mix(in_srgb,var(--ok)_34%,transparent),transparent)] before:content-['']";

function routeMatches(item: ShellNavItem, path: string) {
  if (item.exact) {
    return item.matches.some((match) => path === match);
  }
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

/**
 * Persistent application chrome. Desktop uses the command rail; smaller screens
 * keep a compact top dock so core routes remain reachable.
 */
export function ConsoleFrame({
  agentName,
  brand,
  children,
  operator,
  workspaces,
  activeWorkspaceId,
}: {
  agentName: string;
  brand: ConsoleBrand;
  children: React.ReactNode;
  operator: OperatorShellProfile;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
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
    { label: "Personas", href: "/personas", icon: "personas", matches: ["/personas"] },
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
    { label: "Settings", href: "/settings", icon: "settings", matches: ["/settings"] },
  ];
  const mobilePrimaryNavItems = [homeNavItems[0], navItems[1], growthNavItems[0], growthNavItems[1]];
  const mobileMoreNavItems = navItems.filter((item) => !mobilePrimaryNavItems.some((primary) => primary.href === item.href));
  const activeMobileItem = [...navItems, ...utilityNavItems].find((item) => routeMatches(item, pathname));
  const activeMobileLabel = activeMobileItem?.label ?? brand.productLabel;

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
          <header className="sticky top-0 z-40 flex flex-col gap-2 border-b border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--canvas-deep)_94%,transparent)] px-3 pb-2 pt-2 backdrop-blur lg:hidden">
            <div className="flex min-h-11 items-center gap-2">
              <Link
                href="/"
                className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label={`${brand.workspaceName} ${brand.productLabel} - go to home`}
              >
                <BrandMark />
                <span className="hidden min-w-0 sm:block">
                  <BrandWordmark />
                </span>
              </Link>

              <div className="min-w-0 flex-1 border-l border-[var(--border-hairline)] pl-3">
                <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{activeMobileLabel}</div>
                <div className="truncate text-[11px] leading-4 text-[var(--text-muted)]">{brand.workspaceName}</div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link
                  aria-label={`${operator.name} profile settings`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
                  href="/settings?section=account"
                  title="Profile settings"
                >
                  <OperatorAvatar operator={operator} size="mobile" />
                </Link>
                <Link
                  aria-label="Settings"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
                  href={utilityNavItems[0].href}
                  title="Settings"
                >
                  <Cog aria-hidden className="h-4.5 w-4.5" />
                </Link>
              </div>
            </div>

            <div className="min-w-0">
              <MobileNavDock active={pathname} moreItems={mobileMoreNavItems} primaryItems={mobilePrimaryNavItems} />
            </div>
          </header>

          <aside
            className={cx(
              theme.shell.sidebar,
              "hidden transition-[padding] duration-200 lg:flex lg:flex-col",
              sidebarCollapsed ? "lg:overflow-visible lg:px-3" : "",
            )}
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

              <div className={cx("py-3", sidebarGoldDividerTop, sidebarGoldDividerBottom, sidebarCollapsed ? "flex justify-center" : "")}>
                <ArcCommandLink active={pathname.startsWith("/arc")} agentName={agentName} collapsed={sidebarCollapsed} />
              </div>

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

              <SidebarBottomDock activeWorkspaceId={activeWorkspaceId} collapsed={sidebarCollapsed} operator={operator} settingsHref={utilityNavItems[0].href} workspaceName={brand.workspaceName} workspaces={workspaces} />
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

function OperatorAvatar({ operator, size }: { operator: OperatorShellProfile; size: "mobile" | "desktop" }) {
  const sizeClass = size === "mobile" ? "h-9 w-9 rounded-lg" : "h-9 w-9 rounded-lg";

  return (
    <Avatar className={cx(sizeClass, "border border-[var(--border-hairline)] bg-[var(--surface-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]")}>
      {operator.avatarUrl ? <AvatarImage alt="" src={operator.avatarUrl} /> : null}
      <AvatarFallback className="rounded-lg font-display text-xs font-semibold text-[var(--accent)]">
        {operatorInitials(operator)}
      </AvatarFallback>
    </Avatar>
  );
}

function operatorInitials(operator: OperatorShellProfile) {
  const source = operator.name || operator.email || "Operator";
  const parts = source
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (!parts.length) return "OP";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function MobileNavDock({
  active,
  moreItems,
  primaryItems,
}: {
  active: string;
  moreItems: ShellNavItem[];
  primaryItems: ShellNavItem[];
}) {
  const moreActive = moreItems.some((item) => routeMatches(item, active));

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="grid grid-cols-5 gap-1 rounded-xl border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-soft)_70%,transparent)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
    >
      {primaryItems.map((item) => {
        const isActive = routeMatches(item, active);
        return <MobileNavLink active={isActive} item={item} key={item.href} />;
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="More navigation"
            aria-pressed={moreActive}
            className={cx(
              "group relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
              moreActive
                ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-contrast)]"
                : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)]",
            )}
            type="button"
          >
            <MoreHorizontal aria-hidden className={cx("h-5 w-5", moreActive ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]")} />
            <span className="max-w-full truncate">More</span>
            {moreActive ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-4 bottom-0 h-px rounded-full bg-[color-mix(in_srgb,var(--accent)_62%,transparent)]"
              />
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-56 border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 text-[var(--text-primary)] shadow-[var(--elev-raised)]"
          sideOffset={8}
        >
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Navigate
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[var(--border-hairline)]" />
          {moreItems.map((item) => {
            const isActive = routeMatches(item, active);
            return (
              <DropdownMenuItem asChild className="p-0 focus:bg-transparent focus:text-[var(--text-primary)]" key={item.href}>
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={cx(
                    "flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-contrast)]"
                      : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)]",
                  )}
                  href={item.href}
                  prefetch
                >
                  <NavIcon className={cx("h-4.5 w-4.5 shrink-0", isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]")} name={item.icon} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

function MobileNavLink({ active, item }: { active: boolean; item: ShellNavItem }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
        active
          ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-contrast)]"
          : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)]",
      )}
      href={item.href}
      prefetch
    >
      <NavIcon className={cx("h-5 w-5 shrink-0", active ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]")} name={item.icon} />
      <span className="max-w-full truncate">{item.label}</span>
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-4 bottom-0 h-px rounded-full bg-[color-mix(in_srgb,var(--accent)_62%,transparent)]"
        />
      ) : null}
    </Link>
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
      {!collapsed ? <span className="truncate text-sm font-semibold text-current">{agentName}</span> : null}
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

function SidebarBottomDock({
  collapsed,
  operator,
  settingsHref,
  workspaceName,
  workspaces,
  activeWorkspaceId,
}: {
  collapsed?: boolean;
  operator: OperatorShellProfile;
  settingsHref: string;
  workspaceName: string;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
}) {
  return (
    <div className={cx(sidebarBottomDock, collapsed ? "space-y-2 px-1.5 py-2.5" : "space-y-3.5 px-3 py-3.5")}>
      <SidebarWorkspaceSwitcher
        activeWorkspaceId={activeWorkspaceId}
        collapsed={collapsed}
        workspaceName={workspaceName}
        workspaces={workspaces}
      />
      <OperatorProfile collapsed={collapsed} operator={operator} settingsHref={settingsHref} />
    </div>
  );
}

function SidebarWorkspaceSwitcher({
  collapsed,
  workspaceName,
  workspaces,
  activeWorkspaceId,
}: {
  collapsed?: boolean;
  workspaceName: string;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
}) {
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  // Fall back to a single read-only entry when there's no signed-in workspace
  // list (open/dev mode, or Supabase not configured).
  const list: Workspace[] = workspaces?.length ? workspaces : [{ id: "current", name: workspaceName, plan: "Workspace" }];
  const selectedId = activeWorkspaceId && list.some((workspace) => workspace.id === activeWorkspaceId) ? activeWorkspaceId : list[0]?.id;

  function handleChange(workspace: Workspace) {
    if (switching || workspace.id === "current" || workspace.id === selectedId) return;
    startSwitch(async () => {
      const result = await switchWorkspaceAction(workspace.id);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className={cx(collapsed ? "flex justify-center" : "", switching ? "pointer-events-none opacity-70" : "")}>
      {!collapsed ? (
        <div className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {switching ? "Switching…" : "Workspace"}
        </div>
      ) : null}
      <Workspaces onWorkspaceChange={handleChange} selectedWorkspaceId={selectedId} workspaces={list}>
        <WorkspaceTrigger collapsed={collapsed} />
        <WorkspaceContent align={collapsed ? "center" : "start"} side={collapsed ? "right" : "top"} sideOffset={10} title="Workspaces">
          <Link
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            href="/settings?section=workspace"
          >
            <Cog aria-hidden className="h-4 w-4 text-[var(--text-muted)]" />
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
    <section className={cx("min-w-0", collapsed ? "pt-1" : "space-y-1.5 pt-3", !collapsed ? sidebarGoldDividerTop : "")} aria-label={label}>
      {!collapsed && label ? (
        <div className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {label}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function OperatorProfile({ collapsed, operator, settingsHref }: { collapsed?: boolean; operator: OperatorShellProfile; settingsHref: string }) {
  return (
    <div className={cx("flex items-center", collapsed ? "justify-center" : "gap-2 border-t border-[var(--border-hairline)] pt-3")}>
      <div className={cx("flex min-w-0 flex-1 items-center gap-3", collapsed ? "justify-center" : "")}>
        <div className="relative shrink-0">
          <OperatorAvatar operator={operator} size="desktop" />
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-sidebar)] bg-[var(--ok)]"
          />
        </div>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{operator.name}</div>
            <div className="truncate text-[11px] text-[var(--text-muted)]">{operator.email ?? "Operator"}</div>
          </div>
        ) : null}
      </div>
      {!collapsed ? (
        <Link
          aria-label="Settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
          href={settingsHref}
          title="Settings"
        >
          <Cog aria-hidden className="h-4.5 w-4.5" />
        </Link>
      ) : null}
    </div>
  );
}
