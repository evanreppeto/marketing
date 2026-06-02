"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { statusTone } from "./status-tone";

export function CampaignGallery({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const statuses = useMemo(() => ["All", ...Array.from(new Set(campaigns.map((c) => c.status)))], [campaigns]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = campaigns.filter((campaign) => {
    const matchStatus = filter === "All" || campaign.status === filter;
    const matchQuery = q.length === 0 || `${campaign.name} ${campaign.persona} ${campaign.objective}`.toLowerCase().includes(q);
    return matchStatus && matchQuery;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => {
            const isActive = filter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
          No campaigns match{q ? ` "${query.trim()}"` : ""}{filter !== "All" ? ` in "${filter}"` : ""}.
        </p>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <Link
      href={campaign.href}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] transition hover:border-[var(--border-strong)]"
    >
      <CardCover campaign={campaign} />

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
