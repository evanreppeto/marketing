import { connection } from "next/server";

import { EmptyState, PageHeader } from "../../_components/page-header";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";
import { getAgentDisplayName } from "@/lib/mark-chat/agent-config";
import { getCampaignPerformance } from "@/lib/performance/campaign-performance";
import { getAppSettings } from "@/lib/settings/store";

import { CampaignAnalyticsDetail } from "../_components/campaign-analytics-detail";

export const metadata = {
  title: "Campaign analytics",
};

type CampaignAnalyticsPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignAnalyticsPage({ params }: CampaignAnalyticsPageProps) {
  await connection();

  const { campaignId } = await params;
  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const [detail, performance] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId, undefined, agentName),
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
