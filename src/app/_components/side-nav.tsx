"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NavIcon, type NavIconName } from "./nav-icons";
import { cx } from "./theme";

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
  /** Collapsed icon-rail mode (Mark focus mode): items are centered icon squares
   *  that expand to full labelled rows when the rail (group/rail) is hovered/focused. */
  collapsible?: boolean;
};

function matchesItem(item: ShellNavItem, path: string) {
  if (item.exact) {
    return item.matches.some((match) => path === match);
  }
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

export function SideNav({ active, items, collapsible = false }: SideNavProps) {
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
    <nav aria-busy={pendingHref ? "true" : undefined} aria-label="Main navigation" className="flex gap-2 lg:flex-col">
      {items.map((item) => {
        const isActive = pendingHref ? item.href === pendingHref : matchesItem(item, currentPath);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "group inline-flex min-h-11 shrink-0 items-center rounded-lg text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              collapsible
                ? "gap-3 px-3.5 lg:w-full lg:justify-center lg:px-0 lg:group-hover/rail:justify-start lg:group-hover/rail:px-3.5 lg:group-focus-within/rail:justify-start lg:group-focus-within/rail:px-3.5"
                : "gap-3 px-3.5 lg:w-full",
              isActive
                ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
            )}
            href={item.href}
            key={item.href}
            onClick={(event) => {
              if (!matchesItem(item, currentPath)) {
                setPending({ fromPath: currentPath, href: item.href });
              }
              // Drop focus so the rail doesn't stay held open via focus-within
              // after navigating (the click leaves the link focused otherwise).
              event.currentTarget.blur();
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
              className={cx(
                "whitespace-nowrap transition-transform duration-150 group-hover:translate-x-0.5",
                collapsible && "lg:hidden lg:group-hover/rail:inline lg:group-focus-within/rail:inline",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
