import { ActionFeedback, OperatorBar, PageHeader, StatusPill } from "@/app/_components/page-header";
import { OpportunityCommandCenter } from "@/app/_components/opportunity-command-center";
import { buildOpportunityBuckets, listOpenOpportunities } from "@/lib/opportunities/read-model";

import { scanOpportunitiesAction } from "./actions";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  const records = await listOpenOpportunities();
  const buckets = buildOpportunityBuckets(records);

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
          <form action={scanOpportunitiesAction}>
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Scan for opportunities
            </button>
          </form>
        }
      />

      <ActionFeedback action={action} messages={{ scanned: "Scan complete." }} />

      <OpportunityCommandCenter buckets={buckets} />
    </>
  );
}
