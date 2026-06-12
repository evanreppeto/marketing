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
  /** When true, labels are visually hidden at lg (icon rail). Mobile always shows labels. */
  collapsed?: boolean;
};

function matchesItem(item: ShellNavItem, path: string) {
  if (item.exact) {
    return item.matches.some((match) => path === match);
  }
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

export function SideNav({ active, items, collapsed = false }: SideNavProps) {
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
      className={`flex gap-2 lg:flex-col${collapsed ? " side-rail-collapsed" : ""}`}
    >
      {items.map((item) => {
        const isActive = pendingHref ? item.href === pendingHref : matchesItem(item, currentPath);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`group inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:w-full ${
              collapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""
            } ${
              isActive
                ? "text-[var(--text-primary)] shadow-[inset_3px_0_0_var(--accent)]"
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
            <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
