"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  /** When true, labels are visually hidden at lg (icon rail). */
  collapsed?: boolean;
  /** Compact icon dock for the mobile top bar so every destination is visible. */
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
      className={`${
        mobileDock ? "flex min-w-0 flex-1 justify-around gap-0.5 lg:flex-col lg:justify-start lg:gap-2" : "flex gap-2 lg:flex-col"
      }${collapsed ? " side-rail-collapsed" : ""}`}
    >
      {items.map((item) => {
        const isActive = pendingHref ? item.href === pendingHref : matchesItem(item, currentPath);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`group inline-flex shrink-0 items-center rounded-lg text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              mobileDock
                ? "h-10 w-8 justify-center gap-0 px-0 lg:min-h-11 lg:w-full lg:justify-start lg:gap-3 lg:px-3.5"
                : "min-h-11 gap-3 px-3.5 lg:w-full"
            } ${
              collapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""
            } ${
              isActive
                ? mobileDock
                  ? "font-semibold text-[var(--accent)] shadow-[inset_0_-2px_0_var(--accent)] lg:shadow-[inset_4px_0_0_var(--accent)]"
                  : "font-semibold text-[var(--accent)] shadow-[inset_4px_0_0_var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
            }`}
            href={item.href}
            key={item.href}
            title={item.label}
            onClick={() => {
              if (!matchesItem(item, currentPath)) {
                setPending({ fromPath: currentPath, href: item.href });
              }
            }}
            onFocus={() => router.prefetch(item.href)}
            onMouseEnter={() => router.prefetch(item.href)}
            prefetch
          >
            <NavIcon
              className={`h-5 w-5 shrink-0 transition ${
                isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
              }`}
              name={item.icon}
            />
            <span
              className={`${
                mobileDock ? "sr-only lg:not-sr-only lg:min-w-0 lg:max-w-[160px] lg:overflow-hidden lg:whitespace-nowrap" : "min-w-0 max-w-[160px] overflow-hidden whitespace-nowrap"
              } opacity-100 transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                collapsed ? "lg:max-w-0 lg:-translate-x-1 lg:opacity-0" : ""
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
