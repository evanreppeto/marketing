"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { statusTone } from "./status-tone";

const PAGE_SIZES = [6, 12, 24];

export function CampaignGallery({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const statuses = useMemo(() => ["All", ...Array.from(new Set(campaigns.map((c) => c.status)))], [campaigns]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  const q = query.trim().toLowerCase();
  const filtered = campaigns.filter((campaign) => {
    const matchStatus = filter === "All" || campaign.status === filter;
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
            {statuses.map((status) => {
              const isActive = filter === status;
              const count = campaigns.filter((campaign) => status === "All" || campaign.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setFilter(status);
                    resetPage();
                  }}
                  className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-px ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  {status}
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
            No campaigns match{q ? ` "${query.trim()}"` : ""}{filter !== "All" ? ` in "${filter}"` : ""}.
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-[var(--text-secondary)]">
            Page {currentPage} of {pageCount}
          </div>
          <div className="flex gap-2">
            <button
              className="min-h-10 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="min-h-10 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <Link
      href={campaign.href}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-soft)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
    >
      <CardCover campaign={campaign} />

      {campaign.status === "pending_approval" ? (
        <div className="flex items-center gap-1.5 border-b border-[var(--border-hairline)] bg-[oklch(0.82_0.13_85/0.12)] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_70)]" />
          Awaiting approval
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold leading-tight text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{campaign.name}</h3>
        <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
          <Stat value={campaign.assetCount} label="assets" />
          <Stat value={campaign.approvalCount} label="approvals" />
          <Stat value={campaign.mediaCount} label="media" />
          <span className="ml-auto">{campaign.updatedAt}</span>
        </div>
      </div>
    </Link>
  );
}

function CardCover({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <div className="relative h-40 overflow-hidden bg-[radial-gradient(circle_at_22%_18%,oklch(0.74_0.115_232/0.3),transparent_62%),linear-gradient(135deg,var(--surface-raised),var(--surface-inset))]">
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

      <span className="absolute left-3 top-3 rounded border border-[var(--border-strong)] bg-[oklch(0.1_0.03_250/0.72)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)] backdrop-blur-sm">
        {campaign.persona}
      </span>
      <span className="absolute right-3 top-3">
        <StatusPill tone={statusTone(campaign.status)}>{campaign.status}</StatusPill>
      </span>
    </div>
  );
}

/** Renders the primary asset's copy as a small "document" cover. */
function CopyPreview({ label, text }: { label: string | null; text: string }) {
  return (
    <div className="flex h-full flex-col px-4 pb-3 pt-10">
      {label ? <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{label} draft</span> : null}
      <p className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-[1.5] text-[var(--text-secondary)]">{text}</p>
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
