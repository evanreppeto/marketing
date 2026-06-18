"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { useAgentName } from "../_components/agent-name-context";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { PaginationControls } from "../_components/pagination-controls";
import { type PartnerCard } from "@/lib/partners/read-model";

type PartnerFilter = "all" | "approval" | "high-score" | "needs-enrichment" | "campaign-linked";

const PAGE_SIZES = [4, 8, 16];

const FILTERS: Array<{ key: PartnerFilter; label: string }> = [
  { key: "all", label: "All partners" },
  { key: "approval", label: "Needs approval" },
  { key: "high-score", label: "High score" },
  { key: "needs-enrichment", label: "Needs enrichment" },
  { key: "campaign-linked", label: "Campaign linked" },
];

export function PartnerBoard({ partners }: { partners: PartnerCard[] }) {
  const agentName = useAgentName();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(4);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return partners.filter((partner) => {
      const matchesFilter = matchesPartnerFilter(partner, filter);
      const searchable = [
        partner.name,
        partner.partnerType,
        partner.persona,
        partner.relationshipStage,
        partner.summary,
        partner.nextAction,
        partner.cta,
        partner.revenue,
        partner.status,
        partner.scoreSource,
        ...partner.missingFields,
        ...partner.riskFlags,
        ...partner.campaigns.map((campaign) => campaign.name),
        ...partner.approvals.map((approval) => approval.title),
        ...partner.evidence.map((item) => `${item.label} ${item.detail ?? ""} ${item.href ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [filter, normalizedQuery, partners]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visiblePartners = filtered.slice(startIndex, endIndex);

  function resetPage() {
    setPage(1);
  }

  if (partners.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title="No partner candidates yet"
          detail={`Once ${agentName} finds or imports companies with partner personas, partner tier, or partner-score metadata, they will appear here.`}
          action={
            <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">
              Open {agentName} tasks
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <section className="overflow-hidden">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Partner queue</span>
              <StatusPill tone="amber">Outbound locked</StatusPill>
              <StatusPill tone="blue">{partners.length} candidates</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Showing {startIndex + (filtered.length > 0 ? 1 : 0)}-{endIndex} of {filtered.length}
              {filtered.length === partners.length ? "" : ` matched from ${partners.length}`} partner records.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="relative block">
              <span className="sr-only">Search partner queue</span>
              <svg
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 20 20"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m18 18-4.5-4.5" strokeLinecap="round" />
              </svg>
              <input
                aria-label="Search partner queue"
                className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
                placeholder="Search partners..."
                type="search"
                value={query}
              />
            </label>

            <label className="block">
              <span className="sr-only">Partner cards per page</span>
              <select
                className="h-11 w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  resetPage();
                }}
                value={pageSize}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} cards
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-[var(--border-hairline)]">
          {FILTERS.map((item) => {
            const selected = filter === item.key;
            const count = partners.filter((partner) => matchesPartnerFilter(partner, item.key)).length;

            return (
              <button
                aria-pressed={selected}
                className={`relative inline-flex min-h-9 cursor-pointer items-center rounded px-3 text-sm font-semibold transition active:translate-y-px ${
                  selected
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                key={item.key}
                onClick={() => {
                  setFilter(item.key);
                  resetPage();
                }}
                type="button"
              >
                {item.label}
                <span className={`ml-2 font-mono text-xs tabular-nums ${selected ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{count}</span>
                {selected ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-px rounded-full bg-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {visiblePartners.length > 0 ? (
        <div className="grid gap-3 p-4 xl:grid-cols-2">
          {visiblePartners.map((partner) => (
            <PartnerDevelopmentCard key={partner.id} partner={partner} />
          ))}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title="No matching partners" detail="Clear the search or choose a different partner filter." />
        </div>
      )}

      <PaginationControls
        currentPage={currentPage}
        endIndex={endIndex}
        itemLabel="partners"
        onPageChange={setPage}
        pageCount={pageCount}
        startIndex={startIndex}
        total={filtered.length}
      />
    </section>
  );
}

function PartnerDevelopmentCard({ partner }: { partner: PartnerCard }) {
  const router = useRouter();
  const agentName = useAgentName();

  return (
    <article
      aria-label={`Open CRM record for ${partner.name}`}
      className="cursor-pointer rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4 transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        router.push(partner.href);
      }}
      onKeyDown={(event) => {
        if (isInteractiveTarget(event.target)) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(partner.href);
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={partner.scoreTone}>{typeof partner.score === "number" ? `${partner.score}` : "Unscored"}</StatusPill>
            <StatusPill tone={partner.partnerTypeSource === "missing" ? "amber" : "blue"}>{partner.partnerType}</StatusPill>
            {partner.openApprovals > 0 ? <StatusPill tone="amber">{partner.openApprovals} approvals</StatusPill> : null}
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
          <Link className="mt-3 block truncate text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={partner.href}>
            {partner.name}
          </Link>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{partner.summary}</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Revenue</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{partner.revenue}</div>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Contacts" value={partner.contacts} />
        <MiniStat label="Leads" value={partner.leads} />
        <MiniStat label="Campaigns" value={partner.campaigns.length} />
        <MiniStat label="Last signal" value={partner.lastSignal} />
      </dl>

      <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{agentName}-safe next action</div>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-primary)]">{partner.nextAction}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={partner.nextActionHref}>
            Open next step
          </Link>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={partner.href}>
            CRM record
          </Link>
          {partner.websiteUrl ? (
            <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={partner.websiteUrl} rel="noreferrer" target="_blank">
              Source site
            </a>
          ) : null}
        </div>
      </div>

      {partner.campaigns.length > 0 || partner.approvals.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {partner.approvals.slice(0, 2).map((approval) => (
            <Link
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              href={approval.href}
              key={approval.id}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-[var(--text-primary)]">{approval.title}</span>
                <StatusPill tone={riskTone(approval.riskLevel)}>{approval.riskLevel}</StatusPill>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">{approval.status}</div>
            </Link>
          ))}
          {partner.campaigns.slice(0, 2).map((campaign) => (
            <Link
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              href={campaign.href}
              key={campaign.id}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-[var(--text-primary)]">{campaign.name}</span>
                <StatusPill tone="blue">{campaign.status}</StatusPill>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">Campaign package</div>
            </Link>
          ))}
        </div>
      ) : null}

      {partner.missingFields.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {partner.missingFields.slice(0, 6).map((field) => (
            <span className="rounded-md border border-[oklch(0.82_0.13_85/0.32)] bg-[oklch(0.82_0.13_85/0.1)] px-2 py-1 text-[11px] font-semibold text-[oklch(0.9_0.09_85)]" key={field}>
              needs {field.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a,button,input,select,textarea,summary"));
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function matchesPartnerFilter(partner: PartnerCard, filter: PartnerFilter) {
  if (filter === "all") return true;
  if (filter === "approval") return partner.openApprovals > 0;
  if (filter === "high-score") return typeof partner.score === "number" && partner.score >= 80;
  if (filter === "needs-enrichment") return partner.missingFields.length > 0 || partner.partnerTypeSource === "missing";
  if (filter === "campaign-linked") return partner.campaigns.length > 0;
  return true;
}

function riskTone(risk: string) {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium/i.test(risk)) return "amber";
  return "green";
}
