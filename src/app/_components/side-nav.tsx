"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ActiveMotionMarker } from "./motion-primitives";
import { NavIcon, type NavIconName } from "./nav-icons";

export type ShellNavItem = {
  label: string;
  href: string;
  icon: NavIconName;
  matches: string[];
  exact?: boolean;
};

type SideNavProps = {
  active: string;
  items: ShellNavItem[];
  collapsed?: boolean;
  mobileDock?: boolean;
};

function matchesItem(item: ShellNavItem, path: string) {
  if (item.exact) {
    return item.matches.some((match) => path === match);
  }
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

export function SideNav({ active, items, collapsed = false, mobileDock = false }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState<{ fromPath: string; href: string } | null>(null);
  const currentPath = pathname ?? active;
  const pendingHref = pending?.fromPath === currentPath ? pending.href : null;
  const compactRail = collapsed && !mobileDock;

  useEffect(() => {
    for (const item of items) {
      if (!matchesItem(item, currentPath)) {
        router.prefetch(item.href);
      }
    }
  }, [currentPath, items, router]);

  return (
    <nav
      aria-busy={pendingHref ? "true" : undefined}
      aria-label="Main navigation"
      className={`${mobileDock ? "mobile-route-dock flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto pb-1" : "flex w-full flex-col gap-1.5"} ${compactRail ? "side-rail-collapsed items-center" : ""}`}
    >
      {items.map((item) => {
        const isActive = pendingHref ? item.href === pendingHref : matchesItem(item, currentPath);
        const showLabel = !collapsed;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            aria-label={showLabel ? undefined : item.label}
            className={`group relative flex shrink-0 items-center rounded text-sm font-semibold transition-[background-color,color] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              mobileDock
                ? "min-h-11 min-w-[74px] flex-col justify-center gap-1 px-2 py-1.5 text-[11px] leading-none"
                : compactRail
                  ? "h-10 w-10 justify-center px-0"
                  : "min-h-10 w-full gap-2.5 px-2.5"
            } ${
              isActive
                ? "bg-[rgba(255,255,255,0.055)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
            }`}
            href={item.href}
            key={item.href}
            onClick={() => {
              if (!matchesItem(item, currentPath)) {
                setPending({ fromPath: currentPath, href: item.href });
              }
            }}
            onFocus={() => router.prefetch(item.href)}
            onMouseEnter={() => router.prefetch(item.href)}
            prefetch
          >
            <NavIcon className={`h-5 w-5 shrink-0 transition-colors ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"}`} name={item.icon} />
            {showLabel ? (
              <span className={`${mobileDock ? "block max-w-full" : "block"} min-w-0 truncate`}>
                <span className="block truncate">{item.label}</span>
              </span>
            ) : null}
            {isActive && showLabel ? (
              <ActiveMotionMarker
                className={
                  mobileDock
                    ? "pointer-events-none absolute inset-x-4 bottom-0 h-px rounded-full bg-[color-mix(in_srgb,var(--accent)_62%,transparent)]"
                    : "pointer-events-none absolute inset-y-2 right-2 w-px rounded-full bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                }
                layoutId={mobileDock ? "active-mobile-nav-marker" : "active-desktop-nav-marker"}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
