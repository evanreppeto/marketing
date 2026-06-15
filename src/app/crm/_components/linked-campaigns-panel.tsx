import Link from "next/link";

import { EmptyState, Panel, StatusPill } from "@/app/_components/page-header";
import type { LinkedCampaign } from "@/lib/campaigns/read-model";

const LIFECYCLE_TONE: Record<LinkedCampaign["lifecycle"], "gray" | "amber" | "blue" | "green"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "blue",
  Live: "green",
};

export function LinkedCampaignsPanel({ campaigns }: { campaigns: LinkedCampaign[] }) {
  return (
    <Panel className="module-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="signal-eyebrow">Connected work</div>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Campaigns referencing this record</h2>
        </div>
        <StatusPill tone="blue">{campaigns.length}</StatusPill>
      </div>
      {campaigns.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No campaigns linked yet" detail="When campaigns, assets, or approvals reference this record, they will appear here." />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={campaign.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-[var(--text-primary)]">{campaign.name}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">{campaign.persona}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {campaign.pendingCount > 0 ? (
                    <span className="text-xs font-semibold text-[var(--text-muted)]">{campaign.pendingCount} awaiting</span>
                  ) : null}
                  <StatusPill tone={LIFECYCLE_TONE[campaign.lifecycle]}>{campaign.lifecycle}</StatusPill>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
