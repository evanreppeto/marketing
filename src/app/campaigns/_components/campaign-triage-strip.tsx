"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { decideAssetAction } from "../actions";

export function CampaignTriageStrip({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const needs = campaigns.filter((c) => c.pendingDeliverables.length > 0);
  // The whole strip is a single collapsed bar by default — open it to triage.
  const [open, setOpen] = useState(false);
  if (needs.length === 0) return null;

  const total = needs.reduce((sum, c) => sum + c.pendingDeliverables.length, 0);
  // Inside the open strip, a lone campaign expands automatically.
  const single = needs.length === 1;

  return (
    <section
      aria-label="Needs your decision"
      className="module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-[var(--surface-inset)] px-5 py-3 text-left transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
            ›
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Needs your decision</span>
        </span>
        <StatusPill tone="amber">
          {total} awaiting · {needs.length} campaign{needs.length === 1 ? "" : "s"}
        </StatusPill>
      </button>

      {open ? (
        <ul className="max-h-[26rem] divide-y divide-[var(--border-hairline)] overflow-y-auto border-t border-[var(--border-hairline)]">
          {needs.map((campaign) => (
            <CampaignGroup key={campaign.id} campaign={campaign} defaultOpen={single} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CampaignGroup({ campaign, defaultOpen }: { campaign: CampaignWorkspaceListItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = campaign.pendingDeliverables.length;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
            ›
          </span>
          <span className="truncate text-sm font-bold text-[var(--text-primary)]">{campaign.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="hidden text-xs font-semibold text-[var(--text-muted)] sm:inline">{campaign.persona}</span>
          <StatusPill tone="amber">{count}</StatusPill>
        </span>
      </button>

      {open ? (
        <div className="px-5 pb-3">
          <div className="mb-2 flex justify-end">
            <Link href={campaign.href} className="text-xs font-semibold text-[var(--accent)] hover:underline">
              Open campaign
            </Link>
          </div>
          <ul className="space-y-1.5">
            {campaign.pendingDeliverables.map((deliverable) => (
              <TriageRow
                key={deliverable.assetId}
                campaignId={campaign.id}
                assetId={deliverable.assetId}
                title={deliverable.title}
                kind={deliverable.kind}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function TriageRow({ campaignId, assetId, title, kind }: { campaignId: string; assetId: string; title: string; kind: string }) {
  const [state, formAction, isPending] = useActionState(decideAssetAction, null);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="ml-2 text-xs font-semibold text-[var(--text-muted)]">{kind}</span>
      </span>
      <form action={formAction} className="flex items-center gap-1.5">
        <input type="hidden" name="assetId" value={assetId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <Button type="submit" name="decision" value="approved" variant="approve" size="sm" disabled={isPending}>
          {isPending ? "…" : "Approve"}
        </Button>
        <Button type="submit" name="decision" value="declined" variant="decline" size="sm" disabled={isPending}>
          {isPending ? "…" : "Decline"}
        </Button>
      </form>
      {state ? (
        <span className={`w-full text-xs font-semibold ${state.ok ? "text-[oklch(0.88_0.1_158)]" : "text-[oklch(0.86_0.09_26)]"}`}>
          {state.message}
        </span>
      ) : null}
    </li>
  );
}
