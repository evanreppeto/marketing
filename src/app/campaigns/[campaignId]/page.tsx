import { connection } from "next/server";

import { EmptyState } from "../../_components/page-header";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";
import { getCampaignDispatches } from "@/lib/dispatch/read-model";

import { CampaignWorkspace } from "../_components/campaign-workspace";
import { SlimHeader } from "../_components/slim-header";

type CampaignDetailPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  await connection();

  const { campaignId } = await params;
  const [detail, dispatches] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId),
    getCampaignDispatches(campaignId),
  ]);

  if (detail.status !== "live") {
    const notFound = detail.status === "not_found";
    return (
      <>
        <SlimHeader title={notFound ? "Campaign not found" : "Campaign unavailable"} backHref="/campaigns" />
        <EmptyState
          title={notFound ? "We couldn't find that campaign" : "Campaign workspace unavailable"}
          detail={
            notFound
              ? "This campaign does not exist in the Growth Engine database, or it was removed."
              : detail.message
          }
        />
      </>
    );
  }

  return <CampaignWorkspace detail={detail} dispatches={dispatches} />;
}
