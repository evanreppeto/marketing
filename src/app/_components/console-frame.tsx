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
      <div className="min-h-screen lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border-panel)] bg-[oklch(0.145_0.03_250/0.96)] px-4 py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:hidden">
            <Link
              href="/"
              className="group relative flex h-24 min-w-[190px] shrink-0 items-center justify-center overflow-hidden transition hover:opacity-95 lg:h-36 lg:min-w-0"
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
    <div className="mt-4 hidden border-t border-[var(--border-hairline)] pb-7 pt-4 lg:block">
      <div className="rounded-2xl border border-[var(--border-panel)] bg-[linear-gradient(180deg,var(--surface-inset),var(--surface-soft))] p-4 shadow-[var(--elev-panel)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] font-display text-sm font-black text-[var(--accent)] shadow-[inset_0_1px_0_oklch(0.98_0.01_240/0.08)]">
            ER
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-black tracking-[-0.02em] text-[var(--text-primary)]">Evan</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Operator
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border-hairline)] pt-3">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Mode</div>
            <div className="mt-0.5 text-xs font-bold text-[var(--text-primary)]">{gateEnabled ? "Secured" : "Local"}</div>
          </div>
          {gateEnabled ? (
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="h-full w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2 text-left text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              href="/settings"
            >
              Settings
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
