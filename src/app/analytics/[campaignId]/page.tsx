import { connection } from "next/server";

import { EmptyState, PageHeader } from "../../_components/page-header";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getCampaignPerformance } from "@/lib/performance/campaign-performance";
import { getAppSettings } from "@/lib/settings/store";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { CampaignAnalyticsDetail } from "../_components/campaign-analytics-detail";
import { CampaignAnalyticsDemoDetail } from "../_components/campaign-analytics-demo-detail";
import { getCampaignAnalyticsDemoDetail } from "@/lib/performance/campaign-demo-detail";

export const metadata = {
  title: "Campaign analytics",
};

type CampaignAnalyticsPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignAnalyticsPage({ params }: CampaignAnalyticsPageProps) {
  await connection();

  const { campaignId } = await params;

  // Demo campaign ids (the ones the analytics overview table links to) get the
  // rich, concept-matching analytics detail — a full performance-over-time
  // chart, funnel, channel + per-asset breakdown — rather than the
  // approval-readiness workspace, which only applies to real Supabase records.
  const demo = getCampaignAnalyticsDemoDetail(campaignId);
  if (demo) {
    return <CampaignAnalyticsDemoDetail detail={demo} />;
  }

  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const [detail, performance] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId, undefined, agentName, orgId),
    getCampaignPerformance(campaignId),
  ]);

  if (detail.status !== "live") {
    const notFound = detail.status === "not_found";
    return (
      <>
        <PageHeader
          title={notFound ? "Campaign not found" : "Analytics unavailable"}
          backHref="/analytics"
          backLabel="analytics"
        />
        <EmptyState
          title={notFound ? "We couldn't find that campaign" : "Campaign analytics unavailable"}
          detail={
            notFound
              ? "This campaign does not exist in the Arc database, or it was removed."
              : detail.message
          }
        />
      </>
    );
  }

  return <CampaignAnalyticsDetail detail={detail} performance={performance} />;
}
