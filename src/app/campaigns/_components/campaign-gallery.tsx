"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { statusTone } from "./status-tone";

export function CampaignGallery({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const statuses = useMemo(() => ["All", ...Array.from(new Set(campaigns.map((c) => c.status)))], [campaigns]);
  const [filter, setFilter] = useState("All");

  const visible = filter === "All" ? campaigns : campaigns.filter((c) => c.status === filter);

  return (
    <div className="space-y-4">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((campaign) => (
          <Link
            key={campaign.id}
            href={campaign.href}
            className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] transition hover:border-[var(--border-strong)]"
          >
            <div className="relative h-24 bg-[radial-gradient(circle_at_20%_18%,oklch(0.74_0.115_232/0.28),transparent_60%),linear-gradient(135deg,var(--surface-raised),var(--surface-inset))]">
              <span className="absolute left-3 top-3 rounded border border-[var(--border-strong)] bg-[oklch(0.12_0.03_250/0.7)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                {campaign.persona}
              </span>
              <span className="absolute right-3 top-3">
                <StatusPill tone={statusTone(campaign.status)}>{campaign.status}</StatusPill>
              </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-bold leading-tight text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{campaign.name}</h3>
              <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
                <span><span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{campaign.assetCount}</span> assets</span>
                <span><span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{campaign.approvalCount}</span> approvals</span>
                <span><span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{campaign.mediaCount}</span> media</span>
                <span className="ml-auto">{campaign.updatedAt}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
