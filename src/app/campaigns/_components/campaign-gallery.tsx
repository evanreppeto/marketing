"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PaginationControls } from "@/app/_components/pagination-controls";
import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignRollupBar } from "./campaign-rollup-bar";

const PAGE_SIZES = [12, 24, 48];

const ROLLUP_LABELS: Record<string, string> = {
  needs_review: "Needs review",
  in_progress: "In progress",
  ready: "Ready",
  changes_requested: "Changes requested",
  drafting: "Drafting",
  empty: "No deliverables",
};

export function CampaignGallery({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const states = useMemo(() => ["all", ...Array.from(new Set(campaigns.map((c) => c.rollup.state)))], [campaigns]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const q = query.trim().toLowerCase();
  const filtered = campaigns.filter((campaign) => {
    const matchStatus = filter === "all" || campaign.rollup.state === filter;
    const matchQuery =
      q.length === 0 ||
      `${campaign.name} ${campaign.persona} ${campaign.objective} ${campaign.audienceSummary} ${campaign.offerSummary} ${campaign.assetTypes.join(" ")}`
        .toLowerCase()
        .includes(q);
    return matchStatus && matchQuery;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visible = filtered.slice(startIndex, endIndex);

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] xl:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="signal-eyebrow">Campaign packages</span>
                <StatusPill tone="amber">Outbound locked</StatusPill>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Showing {startIndex + (filtered.length > 0 ? 1 : 0)}-{endIndex} of {filtered.length}
                {filtered.length === campaigns.length ? "" : ` matched from ${campaigns.length}`} packages.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
              <label className="relative block">
                <span className="sr-only">Search campaigns</span>
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="9" cy="9" r="6" />
                  <path d="m18 18-4.5-4.5" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    resetPage();
                  }}
                  placeholder="Search campaigns..."
                  aria-label="Search campaigns"
                  className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                />
              </label>

              <label className="block">
                <span className="sr-only">Campaigns per page</span>
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
            {states.map((state) => {
              const isActive = filter === state;
              const count = campaigns.filter((campaign) => state === "all" || campaign.rollup.state === state).length;
              const label = state === "all" ? "All" : ROLLUP_LABELS[state] ?? state;
              return (
                <button
                  key={state}
                  type="button"
                  onClick={() => {
                    setFilter(state);
                    resetPage();
                  }}
                  className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-px ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  {label}
                  <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <p className="m-4 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
            No campaigns match{q ? ` "${query.trim()}"` : ""}{filter !== "all" ? ` in "${ROLLUP_LABELS[filter] ?? filter}"` : ""}.
          </p>
        )}

        <PaginationControls
          currentPage={currentPage}
          endIndex={endIndex}
          itemLabel="campaign packages"
          onPageChange={setPage}
          pageCount={pageCount}
          startIndex={startIndex}
          total={filtered.length}
        />
      </section>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const primaryType = campaign.assetTypes[0] ?? campaign.previewLabel ?? "Campaign";

  return (
    <Link
      href={campaign.href}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[linear-gradient(180deg,var(--surface-soft),var(--surface-inset))] shadow-[0_18px_42px_oklch(0.08_0.025_250/0.24)] transition duration-200 hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-[0_22px_52px_oklch(0.12_0.055_235/0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] opacity-80" />
      <CardCover campaign={campaign} />


<div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PersonaBadge persona={campaign.persona} />
          <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {primaryType}
          </span>
        </div>
        <div className="mb-3">
          <CampaignRollupBar rollup={campaign.rollup} />
        </div>

        <h3 className="line-clamp-2 text-lg font-black leading-tight text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
          {campaign.name}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>

        <div className="mt-4 grid gap-2 rounded-lg border border-[var(--border-hairline)] bg-[oklch(0.12_0.026_250/0.48)] p-3">
          <MetaLine label="Audience" value={campaign.audienceSummary} />
          <MetaLine label="Offer" value={campaign.offerSummary} />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
          <Stat value={campaign.assetCount} label="assets" />
          <Stat value={campaign.approvalCount} label="approvals" />
          <Stat value={campaign.mediaCount} label="media" />
          <Stat value={campaign.sourceCount} label="sources" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-[var(--text-muted)]">{campaign.updatedAt}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2.5 py-1 font-bold text-[var(--text-primary)] transition group-hover:bg-[var(--accent)] group-hover:text-[var(--surface-inset)]">
            Open package
            <span aria-hidden className="transition group-hover:translate-x-0.5">-&gt;</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function CardCover({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <div className="relative h-44 overflow-hidden bg-[radial-gradient(circle_at_18%_16%,oklch(0.76_0.13_232/0.42),transparent_48%),radial-gradient(circle_at_78%_18%,oklch(0.78_0.11_72/0.16),transparent_42%),linear-gradient(135deg,var(--surface-raised),var(--surface-inset))]">
      {campaign.thumbnailUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config */}
          <img
            src={campaign.thumbnailUrl}
            alt={`${campaign.name} creative`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[oklch(0.1_0.03_250/0.78)] to-transparent" />
        </>
      ) : campaign.previewText ? (
        <CopyPreview label={campaign.previewLabel} text={campaign.previewText} />
      ) : campaign.assetTypes.length > 0 ? (
        <div className="flex h-full items-center justify-center px-4">
          <div className="flex flex-wrap justify-center gap-1.5">
            {campaign.assetTypes.slice(0, 3).map((type) => (
              <span key={type} className="rounded-md border border-[var(--border-strong)] bg-[oklch(0.14_0.03_250/0.55)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] backdrop-blur-sm">
                {type}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">No creative yet</span>
        </div>
      )}

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--surface-soft)] to-transparent" />
    </div>
  );
}

/** Renders the primary asset's copy as a small "document" cover. */
function CopyPreview({ label, text }: { label: string | null; text: string }) {
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-12">
      {label ? <span className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{label} draft</span> : null}
      <p className="line-clamp-4 max-w-[88%] whitespace-pre-wrap text-xs font-semibold leading-[1.55] text-[var(--text-primary)]">{text}</p>
    </div>
  );
}

function PersonaBadge({ persona }: { persona: string }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${personaTone(persona)}`}>
      <span className="truncate">{persona}</span>
    </span>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[72px_minmax(0,1fr)]">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <span className="line-clamp-1 text-xs font-semibold text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{value}</span> {label}
    </span>
  );
}

function personaTone(persona: string) {
  const normalized = persona.toLowerCase();
  if (normalized.includes("property")) {
    return "border-[oklch(0.72_0.14_155/0.48)] bg-[oklch(0.43_0.12_155/0.22)] text-[oklch(0.84_0.13_155)]";
  }
  if (normalized.includes("plumbing") || normalized.includes("sewer") || normalized.includes("drain")) {
    return "border-[oklch(0.76_0.14_232/0.58)] bg-[oklch(0.48_0.14_232/0.22)] text-[oklch(0.84_0.12_232)]";
  }
  if (normalized.includes("insurance")) {
    return "border-[oklch(0.78_0.14_76/0.58)] bg-[oklch(0.52_0.13_76/0.22)] text-[oklch(0.89_0.12_76)]";
  }
  if (normalized.includes("homeowner")) {
    return "border-[oklch(0.76_0.14_18/0.55)] bg-[oklch(0.5_0.14_18/0.2)] text-[oklch(0.88_0.11_18)]";
  }
  return "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--accent)]";
}
