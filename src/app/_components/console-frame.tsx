"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";

const navItems: ShellNavItem[] = [
  { label: "Today", href: "/", iconSrc: "/brand/nav-icons/today-icon.png", matches: ["/"], exact: true },
  { label: "Review", href: "/approvals", iconSrc: "/brand/nav-icons/review-icon.png", matches: ["/approvals"] },
  { label: "CRM", href: "/crm", iconSrc: "/brand/nav-icons/crm-icon.png", matches: ["/crm", "/partners", "/lead-ingestion", "/loss-routing"] },
  { label: "Campaigns", href: "/campaigns", iconSrc: "/brand/nav-icons/review-icon.png", matches: ["/campaigns"] },
  { label: "Mark", href: "/agent-operations", iconSrc: "/brand/nav-icons/mark-icon.png", matches: ["/agent-operations"] },
  { label: "Intelligence", href: "/reports", iconSrc: "/brand/nav-icons/personas-icon.png", matches: ["/reports", "/persona-intelligence"] },
  { label: "Settings", href: "/settings", iconSrc: "/brand/nav-icons/settings-icon.png", matches: ["/settings", "/data-foundation"] },
];

/**
 * The persistent application chrome. Rendered ONCE in the root layout so the
 * sidebar and SideNav's pending state survive navigations; only the page
 * content swaps. Auth pages opt out and render
 * bare (it provides its own full-screen layout). `gateEnabled` comes from the
 * server layout because the operator gate reads server-only env.
 */
export function ConsoleFrame({ gateEnabled, children }: { gateEnabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/forgot-password") {
    return <>{children}</>;
  }

  return (
    <main className="chicago-dark min-h-screen w-full overflow-x-hidden bg-[var(--canvas)] text-[var(--text-primary)] lg:h-screen lg:overflow-hidden">
      <div className="min-h-screen lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border-panel)] bg-[oklch(0.145_0.03_250/0.96)] px-4 py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:hidden">
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

          <OperatorProfile gateEnabled={gateEnabled} />
        </aside>

        <section className="min-w-0 px-4 py-4 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-5 xl:px-10">
          <ShellContent>{children}</ShellContent>
        </section>
      </div>
    </main>
  );
}

function OperatorProfile({ gateEnabled }: { gateEnabled: boolean }) {
  return (
    <div className="mt-5 hidden border-t border-[var(--border-hairline)] pt-4 lg:block">
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] font-display text-sm font-black text-[var(--accent)]">
            ER
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[var(--text-primary)]">Evan</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Operator
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3">
          <span className="text-xs font-semibold text-[var(--text-muted)]">{gateEnabled ? "Session active" : "Local mode"}</span>
          {gateEnabled ? (
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-md text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link className="rounded-md text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]" href="/settings">
              Settings
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
