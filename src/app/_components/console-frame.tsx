"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";

const navItems: ShellNavItem[] = [
  { label: "Today", href: "/", matches: ["/"] },
  { label: "Review", href: "/approvals", matches: ["/approvals"] },
  { label: "CRM", href: "/crm", matches: ["/crm", "/lead-ingestion", "/loss-routing"] },
  { label: "Personas", href: "/persona-intelligence", matches: ["/persona-intelligence", "/customer-types"] },
  { label: "Mark", href: "/agent-operations", matches: ["/agent-operations", "/ai-studio"] },
  { label: "Settings", href: "/score-rules", matches: ["/score-rules", "/data-foundation", "/reports"] },
];

function matchesItem(item: ShellNavItem, path: string) {
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

/**
 * The persistent application chrome. Rendered ONCE in the root layout so the
 * sidebar (and SideNav's pending state + ShellContent's skeleton) survive
 * navigations — only the page content swaps. `/sign-in` opts out and renders
 * bare (it provides its own full-screen layout). `gateEnabled` comes from the
 * server layout because the operator gate reads server-only env.
 */
export function ConsoleFrame({ gateEnabled, children }: { gateEnabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname === "/sign-in") {
    return <>{children}</>;
  }

  const activeItem = navItems.find((item) => matchesItem(item, pathname));

  return (
    <main className="chicago-dark min-h-screen w-full overflow-x-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <div className="min-h-screen lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border-panel)] bg-[oklch(0.145_0.03_250/0.96)] px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            <Link
              href="/"
              className="group relative flex h-24 min-w-[190px] shrink-0 items-center justify-center overflow-hidden transition hover:opacity-95 lg:h-44 lg:min-w-0"
            >
              <Image
                alt="Big Shoulders Restoration M&P"
                className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.015]"
                height={1024}
                priority
                sizes="(min-width: 1024px) 212px, 190px"
                src="/brand/big-shoulders-mp-logo-transparent.png"
                width={1024}
              />
            </Link>

            <SideNav active={pathname} items={navItems} />
          </div>

          <div className="mt-auto hidden pt-4 lg:block">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
              <div className="text-xs font-semibold text-[var(--text-primary)]">Current section</div>
              <div className="mt-1 text-xs text-[var(--text-secondary)]">{activeItem?.label ?? "Growth Engine"}</div>
              {gateEnabled ? (
                <form action="/api/auth/sign-out" method="post" className="mt-3 border-t border-[var(--border-hairline)] pt-3">
                  <button
                    type="submit"
                    className="rounded-md text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-5 xl:px-10">
          <ShellContent>{children}</ShellContent>
        </section>
      </div>
    </main>
  );
}
