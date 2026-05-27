import Link from "next/link";

import { navItems } from "../_data/growth-engine";

type AppShellProps = {
  active: string;
  children: React.ReactNode;
};

export function AppShell({ active, children }: AppShellProps) {
  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f7f5f1] text-[#151515]">
      <div className="grid min-h-screen w-full max-w-full grid-cols-1 overflow-x-hidden xl:block xl:bg-[linear-gradient(90deg,#111214_0_244px,#f7f5f1_244px_100%)]">
        <aside className="flex flex-col border-r border-white/10 bg-[linear-gradient(180deg,#111214_0%,#17191b_58%,#101113_100%)] px-3 py-4 text-white xl:fixed xl:left-0 xl:top-0 xl:h-[100dvh] xl:w-[244px] xl:py-5">
          <Link
            href="/data-foundation"
            className="mx-2 mb-4 block rounded-md px-2 py-1 transition-transform active:-translate-y-px xl:mb-9"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#ff4a43]">
              Big Shoulders
            </div>
            <div className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.04em]">
              Growth Engine
            </div>
          </Link>

          <nav className="grid grid-cols-1 gap-1 text-[14px] sm:grid-cols-3 xl:block xl:space-y-1 xl:text-[15px]" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = item.href === active;

              return (
                <Link
                  className={`group flex min-h-11 items-center gap-3 rounded-md px-3 transition-all duration-200 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f04438] active:-translate-y-px xl:min-h-12 ${
                    isActive
                      ? "bg-[#e7352f] font-semibold text-white shadow-[0_18px_34px_-20px_rgba(231,53,47,0.8)]"
                      : "text-white/70"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  <NavIcon name={item.icon} active={isActive} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 hidden xl:fixed xl:bottom-5 xl:left-3 xl:block xl:w-[220px] xl:space-y-3">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-xs text-white/66">
              <div className="font-semibold text-white">MVP Scope</div>
              <p className="mt-2 leading-5 text-white/62">
                Clean records, clear customer types, water-loss routing, and priority scores.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-[#30b85b] status-breathe" />
                System drafting
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-sm font-semibold">
                  BS
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">Big Shoulders Ops</div>
                  <div className="truncate text-xs text-white/55">Operations team</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 max-w-full overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 xl:ml-[244px] xl:px-9 xl:py-8">{children}</section>
      </div>
    </main>
  );
}

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const className = `h-5 w-5 ${active ? "text-white" : "text-white/62 group-hover:text-white"}`;

  if (name === "database") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <ellipse cx="12" cy="6" rx="6.5" ry="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 6v6c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 12v6c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (name === "crm") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 9h8M8 13h4M15 13h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "intake") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (name === "people") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.8 19c.8-3.1 2.7-4.7 5.2-4.7s4.4 1.6 5.2 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.6 15c2.6.2 4.4 1.5 5.3 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "routing") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.4 6.4 9 9M15 15l2.6 2.6M17.6 6.4 15 9M9 15l-2.6 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "sliders") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
