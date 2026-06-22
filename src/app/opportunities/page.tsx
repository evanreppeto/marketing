import { ActionFeedback, OperatorBar, PageHeader, StatusPill } from "@/app/_components/page-header";
import { OpportunityCommandCenter } from "@/app/_components/opportunity-command-center";
import { buildOpportunityBuckets, listOpenOpportunities } from "@/lib/opportunities/read-model";

import {
  dismissOpportunityAction,
  draftOpportunityWithArcAction,
  requestArcOpportunityScanAction,
  scanOpportunitiesAction,
  snoozeOpportunityAction,
} from "./actions";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  const records = await listOpenOpportunities();
  const buckets = buildOpportunityBuckets(records);
  const bucketsWithActions = buckets.map((b) => ({
    ...b,
    rows: b.rows.map((r) => ({
      ...r,
      actions: (
        <div className="flex flex-wrap gap-2">
          <form action={draftOpportunityWithArcAction}>
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--on-accent)]"
            >
              Draft with Arc
            </button>
          </form>
          <form action={dismissOpportunityAction}>
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)]"
            >
              Dismiss
            </button>
          </form>
          <form action={snoozeOpportunityAction}>
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)]"
            >
              Snooze
            </button>
          </form>
        </div>
      ),
    })),
  }));

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Source-backed opportunities Arc found for review. Nothing is sent, published, launched, spent, or contacted without your approval."
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      />

      <OperatorBar
        task="Review source-backed opportunities"
        detail="Arc scans the CRM for cold leads worth re-engaging and surfaces them here. Scanning only prepares records for review — it never contacts anyone."
        primary={
          <div className="flex flex-wrap gap-2">
            <form action={scanOpportunitiesAction}>
              <button
                type="submit"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--on-accent)]"
              >
                Scan for opportunities
              </button>
            </form>
            <form action={requestArcOpportunityScanAction}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:shadow-[inset_0_0_0_1px_var(--accent)]"
              >
                Ask Arc to find opportunities
              </button>
            </form>
          </div>
        }
      />

      <ActionFeedback
        action={action}
        messages={{
          scanned: "Scan complete.",
          "arc-scanning": "Arc is scanning — new opportunities appear here for approval.",
          drafting: "Arc is drafting a campaign — it'll appear in Campaigns for approval.",
          "draft-error": "Couldn't load that opportunity.",
        }}
      />

      <OpportunityCommandCenter buckets={bucketsWithActions} />
    </>
  );
}
