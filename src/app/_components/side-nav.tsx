"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type ShellNavItem = {
  label: string;
  href: string;
  iconSrc: string;
  matches: string[];
};

type SideNavProps = {
  active: string;
  items: ShellNavItem[];
};

function matchesItem(item: ShellNavItem, path: string) {
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

export function SideNav({ active, items }: SideNavProps) {
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
            className={`group inline-flex min-h-14 shrink-0 items-center gap-3 rounded-lg border px-4 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:w-full ${
              isActive
                ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_3px_0_0_var(--accent)]"
                : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-hairline)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
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
            <Image
              alt=""
              aria-hidden="true"
              className={`h-8 w-8 shrink-0 object-contain transition ${isActive ? "opacity-100" : "opacity-75 group-hover:opacity-95"}`}
              height={64}
              src={item.iconSrc}
              width={64}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
