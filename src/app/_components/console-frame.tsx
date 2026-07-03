"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Cog, LogOut, MoreHorizontal, PlusIcon } from "lucide-react";

import { switchWorkspaceAction } from "../settings/workspace-actions";

import { AgentNameProvider } from "./agent-name-context";
import { CommandMenuProvider } from "./command-menu";
import { WorkspaceNameProvider } from "./workspace-name-context";
import { NavIcon } from "./nav-icons";
import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded } from "./sidebar-state";
import { cx, theme } from "./theme";
import { WorkbenchTopBar } from "./workbench-top-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Premium dock: one calm card, no gold gradient seam — the rail keeps a single
// disciplined accent cue (the active nav bar), not a glowing divider here.
const sidebarBottomDock =
  "overflow-hidden rounded-[13px] border border-[var(--border-hairline)] bg-[linear-gradient(180deg,rgba(255,255,255,0.022),rgba(255,255,255,0.008))] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]";

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
  // Rail is pinned always-open to match the arc-studio.ai mockup (the always-open
  // 236px labeled rail with groups + user row). Hover/focus no longer changes the
  // width, so the rail reserves its width in the grid rather than floating over
  // content.
  const sidebarExpanded = isSidebarExpanded({
    focusWithin: sidebarFocusWithin,
    hovered: sidebarHovered,
    pinned: true,
  });
  const sidebarCollapsed = !sidebarExpanded;
  const overlayExpanded = false;

  const homeNavItems: ShellNavItem[] = [
    { label: "Home", href: "/", icon: "home", matches: ["/"], exact: true },
  ];

  const workNavItems: ShellNavItem[] = [
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
    { label: "CRM", href: "/crm", icon: "crm", matches: ["/crm"] },
    { label: "Opportunities", href: "/opportunities", icon: "opportunities", matches: ["/opportunities"] },
  ];

  const studioNavItems: ShellNavItem[] = [
    { label: "Brand & Files", href: "/library/brand", icon: "brand", matches: ["/library"] },
    { label: "Gallery", href: "/gallery", icon: "gallery", matches: ["/gallery"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
  ];

  const intelligenceNavItems: ShellNavItem[] = [
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
    { label: "Brain", href: "/brain", icon: "brain", matches: ["/brain"] },
    { label: "Personas", href: "/personas", icon: "personas", matches: ["/personas"] },
  ];

  const navItems: ShellNavItem[] = [
    homeNavItems[0],
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc"] },
    ...workNavItems,
    ...studioNavItems,
    ...intelligenceNavItems,
  ];

  const utilityNavItems: ShellNavItem[] = [
    { label: "Settings", href: "/settings", icon: "settings", matches: ["/settings"] },
  ];
  const mobilePrimaryNavItems = [homeNavItems[0], navItems[1], workNavItems[0], workNavItems[1]];
  const mobileMoreNavItems = navItems.filter((item) => !mobilePrimaryNavItems.some((primary) => primary.href === item.href));
  const activeMobileItem = [...navItems, ...utilityNavItems].find((item) => routeMatches(item, pathname));
  const activeMobileLabel = activeMobileItem?.label ?? brand.productLabel;

  if (
    pathname === "/login" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/forgot-password" ||
    pathname === "/onboarding" ||
    pathname === "/welcome"
  ) {
    return <AgentNameProvider value={agentName}>{children}</AgentNameProvider>;
  }

  return (
    <AgentNameProvider value={agentName}>
      <WorkspaceNameProvider value={brand.workspaceName}>
        <CommandMenuProvider>
          <main className={theme.shell.canvas}>
        <div
          className={cx(
            "flex min-h-[100dvh] flex-col lg:grid lg:h-screen lg:min-h-0 lg:ease-out",
            // Always-open rail: reserve its full width so content sits beside it
            // (matches the mockup's pinned 236px labeled rail).
            "lg:grid-cols-[236px_minmax(0,1fr)]",
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
              "hidden lg:flex lg:flex-col lg:transition-[width,padding] lg:duration-200 lg:ease-out",
              "lg:w-[236px]",
              sidebarCollapsed ? "lg:overflow-visible lg:px-3" : "",
              // Float over content when expanded by hover/focus (not pinned).
              overlayExpanded ? "lg:z-30 lg:shadow-[10px_0_44px_-16px_rgba(0,0,0,0.7)]" : "lg:shadow-none",
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
                    // Tenant identity (workspace + product label), not a fixed
                    // wordmark image — so the shell reads as *this* workspace's
                    // branded product (e.g. "Summit Restoration"), matching the
                    // gallery's brand treatment instead of a generic "Arc" mark.
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                        {brand.workspaceName}
                      </span>
                      <span className="truncate text-[10.5px] text-[var(--text-muted)]">{brand.productLabel}</span>
                    </span>
                  ) : null}
                </Link>
              </div>

              {!sidebarCollapsed ? (
                <div
                  aria-hidden
                  className="mx-1 h-px bg-[linear-gradient(90deg,transparent,var(--border-panel)_18%,var(--border-panel)_82%,transparent)]"
                />
              ) : null}

              <div className={cx(sidebarCollapsed ? "flex justify-center" : "")}>
                <ArcCommandLink active={pathname.startsWith("/arc")} agentName={agentName} collapsed={sidebarCollapsed} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                {/* gap is identical in both states so the nav groups never reflow
                    vertically when the rail expands. */}
                <div className="flex flex-col gap-3">
                  <SidebarSection collapsed={sidebarCollapsed} label="Workspace">
                    <SideNav active={pathname} items={homeNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} divider label="Work">
                    <SideNav active={pathname} items={workNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} divider label="Studio">
                    <SideNav active={pathname} items={studioNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} divider label="Intelligence">
                    <SideNav active={pathname} items={intelligenceNavItems} collapsed={sidebarCollapsed} />
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
            <section className="relative isolate min-w-0 flex-1 bg-[var(--canvas)] lg:min-h-0 lg:overflow-hidden">
              <div className="h-full w-full px-3 py-4 sm:px-5 lg:h-screen lg:overflow-y-auto lg:px-5 lg:py-5 xl:px-6 2xl:px-7">
                <WorkbenchTopBar avatar={<OperatorAvatar operator={operator} size="desktop" />} />
                <ShellContent>{children}</ShellContent>
              </div>
            </section>
          )}
        </div>
      </main>
        </CommandMenuProvider>
      </WorkspaceNameProvider>
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
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-medium text-[var(--text-muted)]">
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
  if (collapsed) {
    return (
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={`${agentName} command center`}
        className={cx(
          "group relative mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
          active
            ? "border border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            : "border border-[var(--border-hairline)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.014))] hover:border-[var(--accent-border)]",
        )}
        href="/arc"
        prefetch
      >
        <NavIcon className="h-5.5 w-5.5 shrink-0" name="arc" />
      </Link>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={`${agentName} command center`}
      className={cx(
        "group relative flex min-h-[50px] shrink-0 items-center gap-3 rounded-[12px] px-3 transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
        active
          ? "border border-[var(--accent-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012)),linear-gradient(0deg,color-mix(in_srgb,var(--accent)_9%,transparent),color-mix(in_srgb,var(--accent)_9%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "border border-[var(--border-hairline)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.014))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-[var(--accent-border)]",
      )}
      href="/arc"
      prefetch
    >
      <NavIcon className="h-5.5 w-5.5 shrink-0" name="arc" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{agentName}</span>
          <span
            aria-hidden
            className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--ok)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--ok)_16%,transparent)]"
          />
        </span>
        <span className="truncate text-[10.5px] text-[var(--text-muted)]">AI marketing operator</span>
      </span>
      <kbd className="shrink-0 rounded-[5px] border border-[var(--border-panel)] px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-[0.04em] text-[var(--text-muted)]">
        ⌘K
      </kbd>
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
    <div className={cx(sidebarBottomDock, collapsed ? "space-y-2 p-1.5" : "")}>
      <SidebarWorkspaceSwitcher
        activeWorkspaceId={activeWorkspaceId}
        collapsed={collapsed}
        workspaceName={workspaceName}
        workspaces={workspaces}
      />
      {!collapsed ? <div aria-hidden className="h-px bg-[var(--border-hairline)]" /> : null}
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
      <Workspaces onWorkspaceChange={handleChange} selectedWorkspaceId={selectedId} workspaces={list}>
        <WorkspaceTrigger
          collapsed={collapsed}
          className={collapsed ? undefined : "rounded-none px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.028)]"}
        />
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
  divider,
  label,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
  divider?: boolean;
  label?: string;
}) {
  // The vertical box is identical in both states — same top padding, same
  // fixed-height header band, same gap before the items — so the tabs never
  // shift position when the rail expands. Only the band's *contents* differ:
  // expanded shows the group label; collapsed shows a centered hairline (and
  // nothing for the first, undivided group).
  return (
    <section className="min-w-0 space-y-1.5 pt-3.5" aria-label={label}>
      <div className="flex h-4 items-center px-2.5">
        {collapsed
          ? divider
            ? <div aria-hidden className="mx-auto h-px w-7 bg-[var(--border-hairline)]" />
            : null
          : label
            ? <span className="text-[10px] font-medium text-[var(--text-muted)]">{label}</span>
            : null}
      </div>
      {children}
    </section>
  );
}

function OperatorProfile({ collapsed, operator, settingsHref }: { collapsed?: boolean; operator: OperatorShellProfile; settingsHref: string }) {
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <div className="relative shrink-0">
          <OperatorAvatar operator={operator} size="desktop" />
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-sidebar)] bg-[var(--ok)]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <div className="relative shrink-0">
        <OperatorAvatar operator={operator} size="desktop" />
        <span
          aria-label="Active"
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-sidebar)] bg-[var(--ok)]"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold tracking-[-0.005em] text-[var(--text-primary)]">{operator.name}</div>
        <div className="truncate text-[10.5px] text-[var(--text-muted)]">{operator.email ?? "Operator"}</div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Link
          aria-label="Settings"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
          href={settingsHref}
          title="Settings"
        >
          <Cog aria-hidden className="h-4 w-4" />
        </Link>
        <form action="/api/auth/sign-out" method="post" className="contents">
          <button
            aria-label="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
            title="Sign out"
            type="submit"
          >
            <LogOut aria-hidden className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
