import { connection } from "next/server";

import { EmptyState, PageHeader } from "../../_components/page-header";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";
import { getCampaignDispatches } from "@/lib/dispatch/read-model";
import { getAgentDisplayName } from "@/lib/mark-chat/agent-config";
import { getCampaignEconomics } from "@/lib/performance/attribution-read-model";
import { getAppSettings } from "@/lib/settings/store";

import { CampaignCockpit } from "../_components/campaign-cockpit";

type CampaignDetailPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  await connection();

  const { campaignId } = await params;
  const [detail, dispatches, economics] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId),
    getCampaignDispatches(campaignId),
    getCampaignEconomics(campaignId),
  ]);

  if (detail.status !== "live") {
    const notFound = detail.status === "not_found";
    return (
      <>
        <PageHeader
          eyebrow="Campaign"
          title={notFound ? "Campaign not found" : "Campaign unavailable"}
          backHref="/campaigns"
          backLabel="campaigns"
        />
        <EmptyState
          title={notFound ? "We couldn't find that campaign" : "Campaign workspace unavailable"}
          detail={
            notFound
              ? "This campaign does not exist in the Arc database, or it was removed."
              : detail.message
          }
        />
      </>
    );
  }

  const { assistantName } = await getAppSettings();

  return (
    <CampaignCockpit
      detail={detail}
      dispatches={dispatches}
      economics={economics}
      agentName={getAgentDisplayName(assistantName)}
    />
  );
}
