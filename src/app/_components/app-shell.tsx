import Link from "next/link";
import Image from "next/image";

import { navItems } from "../_data/growth-engine";
import { QuickJump } from "./quick-jump";

type AppShellProps = {
  active: string;
  children: React.ReactNode;
};

const navSections = [
  {
    label: "Core",
    items: ["/data-foundation", "/crm"],
  },
  {
    label: "Marketing",
    items: ["/ai-studio", "/persona-intelligence", "/customer-types"],
  },
  {
    label: "Daily work",
    items: ["/agent-operations", "/lead-ingestion", "/loss-routing"],
  },
  {
    label: "Controls",
    items: ["/score-rules", "/reports"],
  },
];

export function AppShell({ active, children }: AppShellProps) {
  const activeItem = navItems.find((item) => item.href === active);

  return (
    <main className="chicago-dark min-h-screen w-full max-w-full overflow-x-hidden bg-[#07111f] text-[#f7fbff]">
      <div className="grid min-h-screen w-full max-w-full grid-cols-1 overflow-x-hidden xl:block xl:bg-[linear-gradient(90deg,#07111f_0_244px,#091827_244px_100%)]">
        <aside className="flex flex-col border-r border-[#5bb7e8]/20 bg-[linear-gradient(180deg,#07111f_0%,#0d1b2e_58%,#07111f_100%)] px-2.5 py-3 text-white xl:fixed xl:left-0 xl:top-0 xl:h-[100dvh] xl:w-[244px] xl:overflow-hidden xl:px-[clamp(0.35rem,0.75vh,0.625rem)] xl:py-[clamp(0.45rem,1.35vh,1rem)]">
          <Link
            href="/data-foundation"
            className="group mx-1 mb-3 block overflow-hidden rounded-lg border border-[#5bb7e8]/25 bg-[radial-gradient(circle_at_82%_18%,rgba(91,183,232,0.22),transparent_34%),linear-gradient(135deg,#0b1a2a_0%,#07111f_100%)] p-3 shadow-[0_22px_55px_-42px_rgba(91,183,232,0.95)] transition-transform active:-translate-y-px xl:mb-[clamp(0.35rem,1.3vh,0.85rem)] xl:p-[clamp(0.55rem,1.35vh,0.75rem)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#ff625d] xl:text-[clamp(0.5rem,1.15vh,0.625rem)]">
                  Big Shoulders
                </div>
                <div className="mt-1 text-[31px] font-semibold leading-none tracking-[-0.07em] text-white xl:text-[clamp(1.55rem,3.8vh,2rem)]">
                  Signal
                </div>
              </div>
              <span className="signal-radar relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full xl:h-[clamp(2.7rem,6.2vh,3.5rem)] xl:w-[clamp(2.7rem,6.2vh,3.5rem)]">
                <Image
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-contain drop-shadow-[0_0_14px_rgba(91,183,232,0.34)] transition-transform duration-200 group-hover:scale-[1.04]"
                  height={128}
                  priority
                  src="/brand/signal-mark-transparent.png"
                  width={128}
                />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2" aria-hidden="true">
              <span className="h-px rounded-full bg-[#5bb7e8] shadow-[0_0_14px_rgba(91,183,232,0.75)]" />
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rotate-45 bg-[#e53935]" />
                <span className="h-1.5 w-1.5 rotate-45 bg-[#e53935]" />
                <span className="h-1.5 w-1.5 rotate-45 bg-[#e53935]" />
                <span className="h-1.5 w-1.5 rotate-45 bg-[#e53935]" />
              </span>
              <span className="h-px rounded-full bg-[#5bb7e8] shadow-[0_0_14px_rgba(91,183,232,0.75)]" />
            </div>
          </Link>

          <nav
            className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2 xl:block xl:space-y-[clamp(0.35rem,0.8vh,0.55rem)] xl:text-[clamp(0.75rem,1.55vh,0.875rem)]"
            aria-label="Main navigation"
          >
            {(() => {
              const today = navItems.find((item) => item.href === "/");
              if (!today) return null;
              const isActive = active === "/";
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex min-h-10 items-center gap-3 rounded-md border px-3 transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5bb7e8] active:-translate-y-px xl:min-h-[clamp(1.95rem,4vh,2.25rem)] xl:gap-[clamp(0.45rem,1.05vh,0.75rem)] xl:px-[clamp(0.5rem,1.2vh,0.75rem)] ${
                    isActive
                      ? "border-[#e7352f]/55 bg-[#2a0c0c] font-semibold text-white shadow-[inset_4px_0_0_#e7352f,0_16px_32px_-26px_rgba(231,53,47,0.9)]"
                      : "border-[#5bb7e8]/15 bg-[#07111f]/30 text-white/85"
                  }`}
                  href="/"
                >
                  <NavIcon name={today.icon} active={isActive} />
                  {today.label}
                </Link>
              );
            })()}
            {navSections.map((section) => (
              <div className="min-w-0 rounded-md border border-[#5bb7e8]/10 bg-[#07111f]/18 p-1.5" key={section.label}>
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5bb7e8]">
                  {section.label}
                </div>
                <div className="grid gap-1">
                  {section.items.map((href) => {
                    const item = navItems.find((navItem) => navItem.href === href);
                    if (!item) return null;

                    const isActive = item.href === active;

                    return (
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex min-h-10 items-center gap-3 rounded-md border px-3 transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5bb7e8] active:-translate-y-px xl:min-h-[clamp(1.75rem,3.65vh,2.1rem)] xl:gap-[clamp(0.45rem,1.05vh,0.75rem)] xl:px-[clamp(0.5rem,1.2vh,0.75rem)] ${
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
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto hidden pt-3 xl:block xl:w-full xl:pt-[clamp(0.35rem,1vh,0.75rem)]">
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-2 xl:p-[clamp(0.35rem,0.9vh,0.5rem)]">
              <div className="flex items-center gap-3 xl:gap-[clamp(0.45rem,1vh,0.75rem)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 text-[11px] font-semibold xl:h-[clamp(1.4rem,3vh,1.75rem)] xl:w-[clamp(1.4rem,3vh,1.75rem)] xl:text-[clamp(0.55rem,1.2vh,0.6875rem)]">
                  BS
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold xl:text-[clamp(0.7rem,1.45vh,0.875rem)]">Big Shoulders Ops</div>
                  <div className="truncate text-xs text-white/55 xl:text-[clamp(0.58rem,1.2vh,0.75rem)]">Operations team</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 max-w-full overflow-x-hidden xl:ml-[244px]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#5bb7e8]/20 bg-[#081521]/88 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8 xl:px-9">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#9fb0c3]">
              <span className="font-medium text-[#9fb0c3]">Signal</span>
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
  const className = `h-5 w-5 xl:h-[clamp(1rem,2.4vh,1.25rem)] xl:w-[clamp(1rem,2.4vh,1.25rem)] ${active ? "text-white" : "text-white/62 group-hover:text-white"}`;

  if (name === "today") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="13" r="4.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3v2M12 21v.5M3.5 13H2M22 13h-1.5M5.4 6.4 4.4 5.4M19.6 6.4l-1 1M5.4 19.6l-1 1M19.6 19.6l-1-1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

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

  if (name === "persona") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 20c1-3.6 3.3-5.4 6.5-5.4s5.5 1.8 6.5 5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19 5.5 20.5 4M5 5.5 3.5 4M12 2.7V1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
