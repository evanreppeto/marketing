import Link from "next/link";

import { navItems } from "../_data/growth-engine";
import { QuickJump } from "./quick-jump";

type AppShellProps = {
  active: string;
  children: React.ReactNode;
};

export function AppShell({ active, children }: AppShellProps) {
  const activeItem = navItems.find((item) => item.href === active);
  const sidebarWork = [
    ["Open leads", "19", "Review"],
    ["Water queue", "6", "Route"],
    ["Draft assets", "18", "Approve"],
  ];

  return (
    <main className="chicago-dark min-h-screen w-full max-w-full overflow-x-hidden bg-[#07111f] text-[#f7fbff]">
      <div className="grid min-h-screen w-full max-w-full grid-cols-1 overflow-x-hidden xl:block xl:bg-[linear-gradient(90deg,#07111f_0_244px,#091827_244px_100%)]">
        <aside className="flex flex-col border-r border-[#5bb7e8]/20 bg-[linear-gradient(180deg,#07111f_0%,#0d1b2e_58%,#07111f_100%)] px-2.5 py-3 text-white xl:fixed xl:left-0 xl:top-0 xl:h-[100dvh] xl:w-[244px] xl:overflow-hidden xl:py-4">
          <Link
            href="/data-foundation"
            className="mx-2 mb-3 block rounded-md px-2 py-1 transition-transform active:-translate-y-px xl:mb-4"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#e53935]">
              Big Shoulders
            </div>
            <div className="mt-1.5 text-[21px] font-semibold leading-none tracking-[-0.04em]">
              Growth Engine
            </div>
            <div className="chicago-flag-mark mt-2" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </Link>

          <nav
            className="grid grid-cols-1 gap-1 text-[14px] sm:grid-cols-3 xl:block xl:space-y-0.5 xl:text-[14px]"
            aria-label="Main navigation"
          >
            {navItems.map((item) => {
              const isActive = item.href === active;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex min-h-10 items-center gap-3 rounded-md border px-3 transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5bb7e8] active:-translate-y-px xl:min-h-9 xl:px-2.5 ${
                    isActive
                      ? "border-[#5bb7e8]/45 bg-[#102a43] font-semibold text-white shadow-[inset_4px_0_0_#5bb7e8,0_16px_32px_-26px_rgba(91,183,232,0.9)]"
                      : "border-transparent text-white/70"
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

          <div className="mt-3 hidden rounded-md border border-white/10 bg-white/[0.03] p-2.5 xl:block">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5bb7e8]">Today</div>
              <span className="h-2 w-2 rounded-full bg-[#30b85b] status-breathe" />
            </div>
            <div className="divide-y divide-white/10">
              {sidebarWork.map(([label, value, action]) => (
                <div className="grid grid-cols-[1fr_auto] gap-3 py-1.5 first:pt-0 last:pb-0" key={label}>
                  <div>
                    <div className="text-[13px] font-semibold text-white">{label}</div>
                    <div className="mt-0.5 text-xs text-white/52">{action}</div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-[#f7fbff]">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 hidden xl:block">
            <div className="rounded-md border border-[#5bb7e8]/20 bg-[#0b1a2a] p-2.5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5bb7e8]">Guardrails</div>
              <div className="mt-2 grid gap-1.5 text-[11px] text-white/62">
                <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">Water, fire, mold, sewage</div>
                <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">Coverage-neutral copy</div>
                <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">Approval before send</div>
              </div>
            </div>
          </div>

          <div className="mt-auto hidden pt-3 xl:block xl:w-full">
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 text-[11px] font-semibold">
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

        <div className="min-w-0 max-w-full overflow-x-hidden xl:ml-[244px]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#5bb7e8]/20 bg-[#081521]/88 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8 xl:px-9">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#9fb0c3]">
              <span className="font-medium text-[#9fb0c3]">Growth Engine</span>
              <span aria-hidden="true" className="text-[#5bb7e8]">/</span>
              <span className="font-semibold text-[#f7fbff]">{activeItem?.label ?? "Workspace"}</span>
            </nav>
            <div className="flex items-center gap-2 text-xs text-[#9fb0c3]">
              <QuickJump />
            </div>
          </div>

          <section className="px-4 py-5 sm:px-6 lg:px-8 xl:px-9 xl:py-7">{children}</section>
        </div>
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

  if (name === "ai") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9 12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M18 15.5 18.8 18l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.5ZM5.5 3 6.1 4.7 7.8 5.3 6.1 5.9 5.5 7.6 4.9 5.9 3.2 5.3 4.9 4.7 5.5 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "agents") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="12" height="10" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.5 11h.01M14.5 11h.01M12 3.5V6M12 16v3M8.5 19h7M4 10.5H2.5M21.5 10.5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
