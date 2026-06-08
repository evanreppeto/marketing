"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";

const navItems: ShellNavItem[] = [
  { label: "Campaigns", href: "/campaigns", iconSrc: "/brand/nav-icons/review-icon.png", matches: ["/campaigns"] },
  { label: "CRM", href: "/crm", iconSrc: "/brand/nav-icons/crm-icon.png", matches: ["/crm"] },
  { label: "Outbox", href: "/outbox", iconSrc: "/brand/nav-icons/today-icon.png", matches: ["/outbox"] },
  { label: "Gallery", href: "/gallery", iconSrc: "/brand/nav-icons/personas-icon.png", matches: ["/gallery"] },
  { label: "Mark", href: "/mark", iconSrc: "/brand/nav-icons/mark-icon.png", matches: ["/mark"] },
];

/**
 * The persistent application chrome. Rendered ONCE in the root layout so the
 * sidebar and SideNav's pending state survive navigations; only the page
 * content swaps. Auth pages opt out and render
 * bare (it provides its own full-screen layout). `gateEnabled` comes from the
 * server layout because the operator gate reads server-only env.
 */
export function ConsoleFrame({ children }: { gateEnabled: boolean; children: React.ReactNode }) {
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
              href="/campaigns"
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

          <OperatorProfile />
        </aside>

        <section className="min-w-0 px-4 py-4 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-5 xl:px-10">
          <ShellContent>{children}</ShellContent>
        </section>
      </div>
    </main>
  );
}

function OperatorProfile() {
  return (
    <div className="mt-4 hidden border-t border-[var(--border-hairline)] pb-7 pt-4 lg:block">
      <div className="overflow-hidden rounded-2xl border border-[oklch(0.74_0.115_232/0.24)] bg-[linear-gradient(145deg,oklch(0.19_0.036_248/0.98),oklch(0.135_0.028_250/0.98))] shadow-[0_18px_44px_oklch(0.04_0.02_250/0.38)]">
        <div className="h-1 bg-[linear-gradient(90deg,var(--accent),oklch(0.78_0.14_158),transparent)]" />
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[oklch(0.74_0.115_232/0.28)] bg-[oklch(0.22_0.045_248)] font-display text-sm font-black text-[var(--accent)] shadow-[inset_0_1px_0_oklch(0.98_0.01_240/0.08)]">
              ER
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-black tracking-[-0.02em] text-[var(--text-primary)]">Evan</div>
              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Operator
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[oklch(0.12_0.026_250/0.72)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Human approval gate</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-black text-[oklch(0.88_0.1_158)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_158)] shadow-[0_0_12px_oklch(0.78_0.14_158/0.7)]" />
                Active
              </span>
            </div>
            <div className="mt-1 text-[11px] font-semibold leading-5 text-[var(--text-muted)]">
              Campaign review only. Outbound stays locked.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
