"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { PaginationControls } from "@/app/_components/pagination-controls";
import { type ApprovalCard } from "@/lib/approvals/read-model";

type QueueFilter = "all" | "high-risk" | "revision" | "campaigns" | "leads";

const PAGE_SIZES = [6, 12, 24];

const QUEUE_FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: "all", label: "All waiting" },
  { key: "high-risk", label: "Risk flagged" },
  { key: "revision", label: "Revision" },
  { key: "campaigns", label: "Campaigns" },
  { key: "leads", label: "Lead lists" },
];

export function ApprovalQueueTable({ items, selectedItemId }: { items: ApprovalCard[]; selectedItemId?: string | null }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesFilter = filter === "all" || queueBucket(item) === filter;
      const searchable = [
        item.title,
        item.type,
        item.previewText,
        item.persona,
        item.channel,
        item.sourceAgent,
        item.statusLabel,
        item.riskLevel,
        item.campaign.name,
        item.asset.title,
        item.recommendedAction,
        ...item.complianceFlags,
        ...item.riskFlags,
        ...item.evidence,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [filter, items, normalizedQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visibleItems = filtered.slice(startIndex, endIndex);

  function resetPage() {
    setPage(1);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on approval"
        detail="When Mark prepares campaign drafts, lead lists, copy, media concepts, or recommendations that need a human gate, they will appear here."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Approval queue</span>
              <StatusPill tone="amber">Human gate</StatusPill>
              <StatusPill tone="amber">Outbound locked</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Showing {startIndex + (filtered.length > 0 ? 1 : 0)}-{endIndex} of {filtered.length}
              {filtered.length === items.length ? "" : ` matched from ${items.length}`} approval packets.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="relative block">
              <span className="sr-only">Search approval queue</span>
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
                className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
                placeholder="Search approval queue..."
                type="search"
                value={query}
              />
            </label>

            <label className="block">
              <span className="sr-only">Approval packets per page</span>
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

        <div className="mt-4 flex flex-wrap gap-2">
          {QUEUE_FILTERS.map((item) => {
            const selected = filter === item.key;
            const count = items.filter((approval) => item.key === "all" || queueBucket(approval) === item.key).length;

            return (
              <button
                aria-pressed={selected}
                className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-px ${
                  selected
                    ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                }`}
                key={item.key}
                onClick={() => {
                  setFilter(item.key);
                  resetPage();
                }}
                type="button"
              >
                {item.label}
                <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="grid gap-3 p-4 xl:grid-cols-2">
          {visibleItems.map((item) => (
            <ApprovalQueueCard isSelected={selectedItemId === item.id} key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-8">
          <EmptyState title="No matching approval packets" detail="Clear the search or choose another review filter." />
        </div>
      )}

      <PaginationControls
        currentPage={currentPage}
        endIndex={endIndex}
        itemLabel="approval packets"
        onPageChange={setPage}
        pageCount={pageCount}
        startIndex={startIndex}
        total={filtered.length}
      />
    </section>
  );
}

function ApprovalQueueCard({ isSelected, item }: { isSelected: boolean; item: ApprovalCard }) {
  const router = useRouter();
  const detailHref = `/approvals?tab=queue&item=${item.id}`;
  const campaignHref = item.campaign.id ? `/campaigns/${item.campaign.id}` : detailHref;

  return (
    <article
      aria-label={`Open approval review for ${item.title}`}
      className={`cursor-pointer rounded-xl border p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_24px_oklch(0.74_0.115_232/0.14)]" : "border-[var(--border-hairline)] bg-[var(--surface-inset)]"
      }`}
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        router.push(detailHref);
      }}
      onKeyDown={(event) => {
        if (isInteractiveTarget(event.target)) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(detailHref);
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill>
        <StatusPill tone="blue">{item.channel}</StatusPill>
        <StatusPill tone="gray">{item.statusLabel}</StatusPill>
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>

      <Link className="mt-3 block rounded-lg transition hover:text-[var(--accent)]" href={detailHref}>
        <h2 className="line-clamp-2 text-lg font-black tracking-[-0.025em] text-[var(--text-primary)]">{item.title}</h2>
      </Link>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{item.previewText}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <QueueDetail label="Persona" value={item.persona} />
        <QueueDetail label="Created by" value={item.sourceAgent} />
        <QueueDetail label="Campaign" value={item.campaign.name} />
        <QueueDetail label="Recommended" value={item.recommendedAction} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <QueueStat label="Evidence" value={item.evidence.length} />
        <QueueStat label="Risk flags" value={item.riskFlags.length} />
        <QueueStat label="Media" value={item.creativeAssets.length} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={detailHref}>
          Open review
        </Link>
        <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={campaignHref}>
          Campaign package
        </Link>
      </div>
    </article>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a,button,input,select,textarea,summary"));
}

function QueueDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">{value || "Missing"}</div>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 font-mono text-sm font-black text-[var(--accent)]">{value}</div>
    </div>
  );
}

function queueBucket(item: ApprovalCard): QueueFilter {
  if (/high|blocked|medium/i.test(item.riskLevel) || item.riskFlags.length > 0) return "high-risk";
  if (/revision/i.test(`${item.status} ${item.statusLabel}`)) return "revision";
  if (/lead|list/i.test(`${item.type} ${item.title} ${item.asset.type}`)) return "leads";
  if (item.campaign.id || /campaign/i.test(`${item.type} ${item.title}`)) return "campaigns";
  return "all";
}

function riskTone(risk: string): "amber" | "red" | "green" | "blue" | "gray" {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium|warning/i.test(risk)) return "amber";
  if (/low/i.test(risk)) return "green";
  return "gray";
}
