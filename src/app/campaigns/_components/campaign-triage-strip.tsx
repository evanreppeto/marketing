"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { decideAssetAction } from "../actions";

export function CampaignTriageStrip({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const needs = campaigns.filter((c) => c.pendingDeliverables.length > 0);
  if (needs.length === 0) return null;

  const total = needs.reduce((sum, c) => sum + c.pendingDeliverables.length, 0);

  return (
    <section
      aria-label="Needs your decision"
      className="module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3.5">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Needs your decision</span>
        <StatusPill tone="amber">{total} awaiting approval</StatusPill>
      </div>
      <ul className="divide-y divide-[var(--border-hairline)]">
        {needs.map((campaign) => (
          <li key={campaign.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={campaign.href} className="truncate text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent)]">
                {campaign.name}
              </Link>
              <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{campaign.persona}</span>
            </div>
            <ul className="mt-2 space-y-1.5">
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
          </li>
        ))}
      </ul>
    </section>
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
        <Button type="submit" name="decision" value="declined" variant="ghost" size="sm" disabled={isPending}>
          Decline
        </Button>
      </form>
      {state && !state.ok ? <span className="w-full text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </li>
  );
}
