"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";

const navItems: ShellNavItem[] = [
  { label: "Today", href: "/", iconSrc: "/brand/nav-icons/today-icon.png", matches: ["/"] },
  { label: "Review", href: "/approvals", iconSrc: "/brand/nav-icons/review-icon.png", matches: ["/approvals"] },
  { label: "CRM", href: "/crm", iconSrc: "/brand/nav-icons/crm-icon.png", matches: ["/crm", "/lead-ingestion", "/loss-routing"] },
  {
    label: "Personas",
    href: "/persona-intelligence",
    iconSrc: "/brand/nav-icons/personas-icon.png",
    matches: ["/persona-intelligence", "/customer-types"],
  },
  { label: "Mark", href: "/agent-operations", iconSrc: "/brand/nav-icons/mark-icon.png", matches: ["/agent-operations", "/ai-studio"] },
  {
    label: "Settings",
    href: "/score-rules",
    iconSrc: "/brand/nav-icons/settings-icon.png",
    matches: ["/score-rules", "/data-foundation", "/reports"],
  },
];

const sectionDetails: Record<
  string,
  {
    detail: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
    checks: Array<{ label: string; value: string }>;
    markHelp: string;
  }
> = {
  Today: {
    detail: "Human decisions, review counts, and the next best place to start.",
    primaryLabel: "Open approvals",
    primaryHref: "/approvals",
    secondaryLabel: "Check Mark",
    secondaryHref: "/agent-operations",
    checks: [
      { label: "Human gate", value: "On" },
      { label: "Outbound", value: "Locked" },
      { label: "CRM source", value: "Live" },
    ],
    markHelp: "Mark can prepare the next review packet, but approvals stay with the operator.",
  },
  Review: {
    detail: "Approve, reject, or request changes on work Mark prepared.",
    primaryLabel: "Review queue",
    primaryHref: "/approvals",
    secondaryLabel: "Go to Mark",
    secondaryHref: "/agent-operations",
    checks: [
      { label: "Drafts", value: "Queued" },
      { label: "Risk flags", value: "Visible" },
      { label: "Decision log", value: "Tracked" },
    ],
    markHelp: "Mark can revise drafts or create evidence summaries after you request changes.",
  },
  CRM: {
    detail: "Companies, contacts, leads, properties, jobs, and outcomes.",
    primaryLabel: "View leads",
    primaryHref: "/crm/leads",
    secondaryLabel: "Companies",
    secondaryHref: "/crm/companies",
    checks: [
      { label: "Lead memory", value: "On" },
      { label: "Relationships", value: "Mapped" },
      { label: "Attribution", value: "Ready" },
    ],
    markHelp: "Mark can enrich records, score fit, and prepare partner recommendations for review.",
  },
  Personas: {
    detail: "Persona intelligence, messaging angles, and revenue context.",
    primaryLabel: "Open personas",
    primaryHref: "/persona-intelligence",
    secondaryLabel: "Customer types",
    secondaryHref: "/customer-types",
    checks: [
      { label: "Audiences", value: "Defined" },
      { label: "Angles", value: "Ready" },
      { label: "Guardrails", value: "Applied" },
    ],
    markHelp: "Mark can classify leads and draft persona-specific campaign briefs.",
  },
  Mark: {
    detail: "Queue one task, inspect run status, and keep dispatch locked.",
    primaryLabel: "Queue task",
    primaryHref: "/agent-operations",
    secondaryLabel: "Approvals",
    secondaryHref: "/approvals",
    checks: [
      { label: "Mode", value: "Draft" },
      { label: "Approval", value: "Required" },
      { label: "Run logs", value: "On" },
    ],
    markHelp: "Mark should find, enrich, score, and draft. He should not send or publish.",
  },
  Settings: {
    detail: "Scoring rules, data health, reports, and operating controls.",
    primaryLabel: "Review rules",
    primaryHref: "/score-rules",
    secondaryLabel: "Data health",
    secondaryHref: "/data-foundation",
    checks: [
      { label: "Weights", value: "Editable" },
      { label: "Health", value: "Watch" },
      { label: "Reports", value: "Linked" },
    ],
    markHelp: "Mark follows these controls when scoring, drafting, and preparing approval items.",
  },
};

function matchesItem(item: ShellNavItem, path: string) {
  return item.matches.some((match) => path === match || (match !== "/" && path.startsWith(match)));
}

/**
 * The persistent application chrome. Rendered ONCE in the root layout so the
 * sidebar and SideNav's pending state survive navigations; only the page
 * content swaps. `/sign-in` opts out and renders
 * bare (it provides its own full-screen layout). `gateEnabled` comes from the
 * server layout because the operator gate reads server-only env.
 */
export function ConsoleFrame({ gateEnabled, children }: { gateEnabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname === "/sign-in") {
    return <>{children}</>;
  }

  const activeItem = navItems.find((item) => matchesItem(item, pathname));
  const activeDetails = activeItem ? sectionDetails[activeItem.label] : null;

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

          <div className="mt-auto hidden space-y-3 pt-4 lg:block">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3.5">
              <div className="flex items-start gap-3">
                {activeItem ? (
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="mt-0.5 h-9 w-9 shrink-0 object-contain"
                    height={72}
                    src={activeItem.iconSrc}
                    width={72}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="signal-eyebrow text-[10px]">Active</div>
                  <div className="mt-1 text-base font-bold text-[var(--text-primary)]">{activeItem?.label ?? "Growth Engine"}</div>
                  {activeDetails ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{activeDetails.detail}</p> : null}
                </div>
              </div>
              {activeDetails ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
                    href={activeDetails.primaryHref}
                  >
                    {activeDetails.primaryLabel}
                  </Link>
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
                    href={activeDetails.secondaryHref}
                  >
                    {activeDetails.secondaryLabel}
                  </Link>
                </div>
              ) : null}
            </div>

            {activeDetails ? (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
                <div className="signal-eyebrow text-[10px]">Operating state</div>
                <div className="mt-3 grid gap-2">
                  {activeDetails.checks.map((check) => (
                    <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--surface-inset)] px-3 py-2" key={check.label}>
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">{check.label}</span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{check.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeDetails ? (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
                <div className="signal-eyebrow text-[10px]">Mark can help</div>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{activeDetails.markHelp}</p>
              </div>
            ) : null}

            <div className="rounded-xl border border-[oklch(0.82_0.13_85/0.28)] bg-[oklch(0.82_0.13_85/0.08)] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[var(--text-primary)]">Mark safety</span>
                <span className="rounded-full border border-[oklch(0.82_0.13_85/0.35)] bg-[oklch(0.82_0.13_85/0.12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[oklch(0.9_0.09_85)]">
                  Locked
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">No send, publish, spend, or contact action without approval.</p>
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
